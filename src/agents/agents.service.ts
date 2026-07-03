import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MachinesService } from '../machines/machines.service';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { MembershipsService } from '../memberships/memberships.service';
import { UsersService } from '../users/users.service';
import { AlertsService } from '../alerts/alerts.service';
import { RoleEnum } from '../roles/roles.enum';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { CreateMembershipDto } from '../memberships/dto/create-membership.dto';
import { AgentTopupDto } from '../wallet/dto/agent-topup.dto';
import {
  AgentLog,
  AgentLogAction,
  AgentLogDocument,
} from './schemas/agent-log.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { UpdateMachineStockDto } from './dto/update-machine-stock.dto';

/** Shape of the agent dashboard KPI response */
export interface AgentDashboardResult {
  /** Number of machines assigned to this agent */
  assignedMachines: number;
  /** Number of orders placed today across all assigned machines */
  todayOrders: number;
  /** Number of orders currently in pending or dispensing state */
  pendingOrders: number;
  /** Cumulative revenue from completed orders (LKR) */
  totalRevenue: number;
  /** Up to 5 most-recently-updated assigned machines */
  machines: unknown[];
  /** Up to 5 most-recent orders */
  recentOrders: unknown[];
}

/**
 * AgentsService encapsulates all business logic for agent-facing operations.
 *
 * Design principle: controllers are thin (HTTP routing + param extraction only).
 * All data manipulation, cross-service calls, and business rules live here.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly machinesService: MachinesService,
    private readonly ordersService: OrdersService,
    private readonly walletService: WalletService,
    private readonly membershipsService: MembershipsService,
    private readonly usersService: UsersService,
    private readonly alertsService: AlertsService,
    @InjectModel(AgentLog.name)
    private readonly agentLogModel: Model<AgentLogDocument>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  /**
   * Builds the agent dashboard KPI summary.
   *
   * Fetches machines and orders in parallel, then computes:
   * - todayOrders  : orders placed since midnight today
   * - pendingOrders: orders in "pending" or "dispensing" state
   * - totalRevenue : sum of totalAmount for all completed orders
   *
   * @param agentId - MongoDB _id of the calling agent
   */
  async getDashboard(agentId: string): Promise<AgentDashboardResult> {
    const machines = await this.machinesService.findAll(undefined, agentId);
    const machineIds = machines.map((m: any) => m.machineId);
    const orders = await this.ordersService.findAllByMachineIds(machineIds);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayOrders = orders.filter(
      (o: any) => new Date(o.createdAt) >= startOfToday,
    );

    const pendingOrders = orders.filter(
      (o: any) => o.status === 'pending' || o.status === 'dispensing',
    );

    const totalRevenue = orders
      .filter((o: any) => o.status === 'completed')
      .reduce((sum: number, o: any) => sum + (o.totalAmount ?? 0), 0);

    this.logger.debug(
      `Dashboard for agent ${agentId}: ${machines.length} machines, ${orders.length} orders`,
    );

    return {
      assignedMachines: machines.length,
      todayOrders: todayOrders.length,
      pendingOrders: pendingOrders.length,
      totalRevenue,
      machines: machines.slice(0, 5),
      recentOrders: orders.slice(0, 5),
    };
  }

  // ─── Machines ────────────────────────────────────────────────────────────────

  /**
   * Returns all machines assigned to the given agent.
   * Delegates filtering to MachinesService (agentId field on the Machine document).
   *
   * @param agentId - MongoDB _id of the calling agent
   */
  getMyMachines(agentId: string) {
    return this.machinesService.findAll(undefined, agentId);
  }

  /**
   * Sends a flush (daily or weekly) command to a specific machine.
   * MachinesService verifies the machine exists before publishing the MQTT command.
   *
   * @param machineId - Human-readable machine identifier (e.g., "MCH-001")
   * @param type      - Flush type: 'daily' | 'weekly'
   */
  triggerFlush(machineId: string, type: 'daily' | 'weekly') {
    return this.machinesService.triggerManualFlush(machineId, type);
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  /**
   * Returns all orders for machines assigned to this agent,
   * optionally filtered by order status.
   *
   * @param agentId - MongoDB _id of the calling agent
   * @param status  - Optional status filter (pending | dispensing | completed | failed)
   */
  async getOrders(agentId: string, status?: string) {
    const machines = await this.machinesService.findAll(undefined, agentId);
    const machineIds = machines.map((m: any) => m.machineId);
    return this.ordersService.findAllByMachineIds(machineIds, status);
  }

  /**
   * Returns orders for the agent's machines in the mobile app format.
   * Enriches each order with the customer's name, phone, address, and customerId
   * by batch-fetching users in a single call.
   *
   * Mobile response shape:
   *   id, customerId, customerName, items[], quantity, amount, status,
   *   deliveryType, address, timestamp, phoneNumber, specialInstructions
   *
   * @param agentId - MongoDB _id of the calling agent
   * @param status  - Optional status filter
   */
  async getMobileOrders(agentId: string, status?: string) {
    const machines = await this.machinesService.findAll(undefined, agentId);
    const machineIds = machines.map((m: any) => m.machineId);
    const orders = (await this.ordersService.findAllByMachineIds(machineIds, status)) as any[];

    if (!orders.length) return [];

    // Batch-fetch all unique customers in one call
    const userIds = [...new Set(orders.map((o) => o.userId).filter(Boolean))];
    const users = userIds.length
      ? await this.usersService.findByIds(userIds)
      : [];

    const userMap = new Map(
      users.map((u: any) => [u.id ?? u._id?.toString(), u]),
    );

    return orders.map((order) => {
      const user = userMap.get(order.userId) as any;
      const fullName = user
        ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
          user.email ||
          '—'
        : '—';

      return {
        id: order.orderId
          ? `#${order.orderId}`
          : `#${order._id?.toString().slice(-6).toUpperCase()}`,
        customerId: user?.customerId ?? order.userId,
        customerName: fullName,
        items: [order.itemName ?? order.itemId],
        quantity: order.quantity,
        amount: order.totalAmount,
        status: order.status
          ? order.status.charAt(0).toUpperCase() + order.status.slice(1)
          : 'Pending',
        deliveryType: order.deliveryType ?? 'auto',
        address: order.deliveryAddress ?? user?.address ?? null,
        timestamp: order.createdAt,
        phoneNumber: user?.phone ?? null,
        specialInstructions: order.specialInstructions ?? null,
      };
    });
  }

  /**
   * Marks an order as completed.
   * OrdersService enforces that the agent is assigned to the machine that owns this order.
   *
   * @param orderId - MongoDB _id of the order
   * @param agentId - MongoDB _id of the calling agent (used for access control)
   * @throws ForbiddenException if the agent does not own the machine
   * @throws NotFoundException  if the order does not exist
   * @throws BadRequestException if the order is already in a terminal state
   */
  completeOrder(orderId: string, agentId: string) {
    return this.ordersService.completeOrder(orderId, agentId, RoleEnum.agent);
  }

  /**
   * Marks an order as failed.
   * If the order was in "dispensing" state, the customer's wallet is automatically refunded.
   * OrdersService enforces machine-level access control.
   *
   * @param orderId - MongoDB _id of the order
   * @param reason  - Human-readable failure reason (shown in the customer notification)
   * @param agentId - MongoDB _id of the calling agent
   * @throws ForbiddenException if the agent does not own the machine
   * @throws NotFoundException  if the order does not exist
   */
  failOrder(orderId: string, reason: string | undefined, agentId: string) {
    return this.ordersService.failOrder(
      orderId,
      reason ?? 'Agent marked the order as failed',
      agentId,
      RoleEnum.agent,
    );
  }

  // ─── Customer Management ─────────────────────────────────────────────────────

  /**
   * Creates a new customer account on behalf of the agent.
   *
   * - Role is always forced to `customer` regardless of any value passed in the DTO.
   * - UsersService auto-generates a CUS-YYYYMMDD-HHMMSS customer ID and a wallet.
   * - Phone numbers are normalised to +94XXXXXXXXX (Sri Lanka) in UsersService.
   *
   * @param dto - Customer creation payload (name, email, password, phone)
   * @throws UnprocessableEntityException if the email is already registered
   */
  async createCustomer(agentId: string, dto: CreateUserDto) {
    const user = await this.usersService.create({
      ...dto,
      role: { id: RoleEnum.customer },
    } as any);
    this.logAction(
      agentId,
      'customer_created',
      (user as any).id,
      dto.email != null ? dto.email : undefined,
      { email: dto.email },
    ).catch(() => {});
    return user;
  }

  /**
   * Resolves a customer QR code (customerId) to userId + walletId.
   * Used by the agent app before performing a cash top-up.
   */
  async getCustomerByQr(customerId: string): Promise<object> {
    const user = (await this.usersService.findByCustomerId(customerId)) as any;
    if (!user) throw new NotFoundException(`Customer ${customerId} not found`);

    const wallet = await this.walletService.getWallet(
      user.id ?? user._id?.toString(),
    );

    return {
      userId: user.id ?? user._id?.toString(),
      customerId: user.customerId,
      customerName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
      phone: user.phone ?? null,
      walletId: (wallet as any).walletId ?? null,
    };
  }

  /**
   * Subscribes a customer to a membership plan on the agent's behalf.
   * The subscription fee is deducted from the *customer's* wallet.
   *
   * @param agentId      - MongoDB _id of the calling agent (logged for audit)
   * @param targetUserId - MongoDB _id of the customer to subscribe
   * @param dto          - Membership plan selection ({ plan: '1month' | '3month' | '5month' })
   * @throws NotFoundException           if the customer does not exist
   * @throws BadRequestException         if the customer already has an active membership
   * @throws UnprocessableEntityException if the wallet balance is insufficient
   */
  subscribeCustomer(
    agentId: string,
    targetUserId: string,
    dto: CreateMembershipDto,
  ) {
    return this.membershipsService.subscribe(agentId, RoleEnum.agent, {
      ...dto,
      targetUserId,
    });
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────────

  /**
   * Credits cash to a customer's wallet on behalf of the agent.
   * Records the agentId in the transaction description for full audit trail.
   *
   * @param agentId - MongoDB _id of the calling agent
   * @param dto     - { targetUserId, amount, note? }
   * @throws NotFoundException if the target customer's wallet does not exist
   * @throws BadRequestException if amount is <= 0
   */
  /**
   * GET /agents/transactions
   * Returns enriched transactions for customers topped-up by this agent
   * (i.e. agent_topup transactions where referenceId = agentId), plus all
   * order_payment and refund transactions for this agent's assigned machines.
   *
   * Response format matches the admin wallet transactions endpoint.
   */
  async getTransactions(
    agentId: string,
    limit = 100,
    skip = 0,
    category?: string,
  ) {
    const txs = (await this.walletService.getAllTransactionsEnriched(
      limit,
      skip,
      undefined,
      category,
      agentId,
    )) as any[];
    return txs.map((tx) => ({
      customerId: tx.customerId,
      amount: tx.amount,
      status: tx.status,
      topupMethod: tx.paymentMethod,
      dateTime: tx.date,
      walletId: tx.walletId,
    }));
  }

  async walletTopup(agentId: string, dto: AgentTopupDto) {
    // Resolve human-readable customerId → MongoDB userId
    const user = (await this.usersService.findByCustomerId(dto.customerId)) as any;
    if (!user) throw new NotFoundException(`Customer ${dto.customerId} not found`);
    const targetUserId = user.id ?? user._id?.toString();

    const tx = (await this.walletService.agentTopup(
      agentId,
      targetUserId,
      dto.amount,
      dto.note,
    )) as any;
    this.logAction(
      agentId,
      'wallet_topup',
      targetUserId,
      `LKR ${dto.amount}`,
      { amount: dto.amount, note: dto.note, customerId: dto.customerId },
    ).catch(() => {});
    return {
      transactionId: tx._id?.toString() ?? tx.id,
      agentId,
      customerId: dto.customerId,
      targetUserId,
      walletId: tx.walletId ?? null,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      status: tx.status,
      category: tx.category,
      note: tx.description ?? null,
      createdAt: tx.createdAt,
    };
  }

  // ─── Inspection ───────────────────────────────────────────────────────────────

  /**
   * Files a machine inspection report.
   * If any checklist items failed or notes were provided, creates a
   * maintenance_required alert. Always logs an inspection_filed activity entry.
   *
   * @param agentId   - MongoDB _id of the calling agent
   * @param machineId - Human-readable machine ID (e.g. MCH-001)
   * @param passed    - Whether all checklist items passed
   * @param failedChecks - Labels of failed checklist items
   * @param notes     - Free-text notes from the agent
   * @param severity  - Alert severity if issues found (low | medium | high | critical)
   */
  async fileInspection(
    agentId: string,
    machineId: string,
    passed: boolean,
    failedChecks: string[],
    notes: string,
    severity: string,
  ): Promise<{ passed: boolean; alertCreated: boolean }> {
    let alertCreated = false;

    if (!passed || notes.trim()) {
      const failedStr =
        failedChecks.length > 0
          ? `Failed checks: ${failedChecks.join(', ')}. `
          : '';
      const noteStr = notes.trim() ? `Notes: ${notes.trim()}` : '';
      await this.alertsService.create({
        machineId,
        type: 'maintenance_required',
        message: `Inspection report — ${failedStr}${noteStr}`,
        severity: severity ?? 'medium',
      });
      alertCreated = true;
    }

    await this.logAction(
      agentId,
      'inspection_filed',
      machineId,
      passed ? 'All checks passed' : `${failedChecks.length} issue(s) reported`,
      { passed, failedChecks, notes, severity, alertCreated },
    );

    return { passed, alertCreated };
  }

  // ─── Activity Log ─────────────────────────────────────────────────────────────

  /** Fire-and-forget action logging (errors do not bubble up to the caller) */
  async logAction(
    agentId: string,
    action: AgentLogAction,
    targetId?: string,
    targetLabel?: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await new this.agentLogModel({
      agentId,
      action,
      targetId,
      targetLabel,
      meta,
    }).save();
  }

  /** Returns the 100 most recent activity log entries for this agent */
  getActivityLog(agentId: string) {
    return this.agentLogModel
      .find({ agentId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  // ─── Machine Stock ────────────────────────────────────────────────────────────

  /**
   * Returns StockItem[] for a single machine assigned to this agent.
   * Coffee machines: one StockItem per inventory entry (unit = cups).
   * Food machines:   one StockItem per unique active-batch itemId (unit = units).
   * Each StockItem includes live reserved (pending/dispensing) and delivered (completed) counts.
   */
  async getMachineStock(agentId: string, machineId: string): Promise<any[]> {
    const machine = await this.machinesService.findByMachineId(machineId);
    if ((machine as any).agentId !== agentId)
      throw new ForbiddenException('Machine not assigned to you');

    const isFoodMachine = (machine as any).machineType === 'food';

    // Collect itemIds present on this machine
    let itemIds: string[];
    if (isFoodMachine) {
      const batches: any[] = (machine as any).batches ?? [];
      itemIds = [
        ...new Set(
          batches
            .filter((b) => b.status === 'active')
            .map((b) => b.itemId),
        ),
      ];
    } else {
      itemIds = ((machine as any).inventory ?? []).map((i: any) => i.itemId);
    }
    if (!itemIds.length) return [];

    // Batch-fetch item master data (name, category, price)
    const items = await this.itemModel
      .find({ _id: { $in: itemIds } })
      .lean()
      .exec();
    const itemMap = new Map(
      items.map((item: any) => [item._id.toString(), item]),
    );

    // Aggregate reserved (pending/dispensing) and delivered (completed) quantities
    const [reservedAgg, deliveredAgg] = await Promise.all([
      this.orderModel.aggregate([
        {
          $match: {
            machineId,
            itemId: { $in: itemIds },
            status: { $in: ['pending', 'dispensing'] },
          },
        },
        { $group: { _id: '$itemId', total: { $sum: '$quantity' } } },
      ]),
      this.orderModel.aggregate([
        {
          $match: {
            machineId,
            itemId: { $in: itemIds },
            status: 'completed',
          },
        },
        { $group: { _id: '$itemId', total: { $sum: '$quantity' } } },
      ]),
    ]);

    const reservedMap = new Map(
      reservedAgg.map((r: any) => [r._id, r.total]),
    );
    const deliveredMap = new Map(
      deliveredAgg.map((d: any) => [d._id, d.total]),
    );

    if (isFoodMachine) {
      const batches: any[] = (machine as any).batches ?? [];
      return itemIds.map((itemId) => {
        const activeBatches = batches.filter(
          (b) => b.itemId === itemId && b.status === 'active',
        );
        const totalStock = activeBatches.reduce(
          (s: number, b: any) => s + (b.quantity ?? 0),
          0,
        );
        const item = itemMap.get(itemId) as any;
        const sampleBatch = activeBatches[0];
        return {
          id: itemId,
          name: sampleBatch?.itemName ?? item?.name ?? itemId,
          category: item?.category ?? 'General',
          totalStock,
          reserved: reservedMap.get(itemId) ?? 0,
          delivered: deliveredMap.get(itemId) ?? 0,
          unit: 'units',
          price: item?.unitPrice ?? 0,
          createdAt: item?.createdAt ?? null,
          updatedAt: item?.updatedAt ?? null,
        };
      });
    } else {
      const inventory: any[] = (machine as any).inventory ?? [];
      return inventory.map((inv) => {
        const item = itemMap.get(inv.itemId) as any;
        const smallestPrice =
          item?.cupSizes?.length
            ? Math.min(...item.cupSizes.map((cs: any) => cs.price))
            : 0;
        return {
          id: inv.itemId,
          name: item?.name ?? inv.itemId,
          category: item?.category ?? 'General',
          totalStock: inv.cupcount ?? 0,
          reserved: reservedMap.get(inv.itemId) ?? 0,
          delivered: deliveredMap.get(inv.itemId) ?? 0,
          unit: 'cups',
          price: smallestPrice,
          createdAt: item?.createdAt ?? null,
          updatedAt: item?.updatedAt ?? null,
        };
      });
    }
  }

  /**
   * Load or unload stock for a specific item on a machine assigned to this agent.
   *
   * Coffee machines (unit = cups):
   *   load   → adds quantity × gramsPerCup grams; cupcount recalculated by updateInventory
   *   unload → subtracts quantity × gramsPerCup grams (floors at 0)
   *
   * Food machines (unit = units):
   *   load   → creates a new batch via loadBatch(); nozzleId required
   *   unload → deducts from the oldest active batch via deductBatchStock()
   */
  async updateMachineStock(
    agentId: string,
    machineId: string,
    itemId: string,
    dto: UpdateMachineStockDto,
  ): Promise<{ message: string }> {
    const machine = await this.machinesService.findByMachineId(machineId);
    if ((machine as any).agentId !== agentId)
      throw new ForbiddenException('Machine not assigned to you');

    const isFoodMachine = (machine as any).machineType === 'food';

    if (isFoodMachine) {
      if (dto.action === 'load') {
        if (!dto.nozzleId)
          throw new BadRequestException(
            'nozzleId is required when loading stock on a food machine',
          );
        const item = (await this.itemModel
          .findById(itemId)
          .lean()
          .exec()) as any;
        await this.machinesService.loadBatch(machineId, agentId, {
          itemId,
          itemName: dto.itemName ?? item?.name ?? itemId,
          nozzleId: dto.nozzleId,
          quantity: dto.quantity,
          expiryDate:
            dto.expiryDate ??
            new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        });
      } else {
        await this.machinesService.deductBatchStock(
          machineId,
          itemId,
          dto.quantity,
        );
      }
    } else {
      const inv = ((machine as any).inventory ?? []).find(
        (i: any) => i.itemId === itemId,
      );
      if (!inv)
        throw new NotFoundException(
          `Item ${itemId} not found in inventory of machine ${machineId}`,
        );
      const gramsPerCup = inv.gramsPerCup > 0 ? inv.gramsPerCup : 18;
      const gramsChange = dto.quantity * gramsPerCup;
      const newStock =
        dto.action === 'load'
          ? inv.currentStock + gramsChange
          : Math.max(0, inv.currentStock - gramsChange);
      await this.machinesService.updateInventory(machineId, {
        itemId,
        currentStock: newStock,
        gramsPerCup,
      });
    }

    return {
      message: `Stock ${dto.action === 'load' ? 'loaded' : 'unloaded'} successfully`,
    };
  }
}
