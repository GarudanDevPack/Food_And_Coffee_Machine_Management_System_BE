import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MachinesService } from '../machines/machines.service';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallet/wallet.service';
import { MembershipsService } from '../memberships/memberships.service';
import { UsersService } from '../users/users.service';
import { RoleEnum } from '../roles/roles.enum';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { CreateMembershipDto } from '../memberships/dto/create-membership.dto';
import { AgentTopupDto } from '../wallet/dto/agent-topup.dto';
import {
  AgentLog,
  AgentLogAction,
  AgentLogDocument,
} from './schemas/agent-log.schema';

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
    @InjectModel(AgentLog.name)
    private readonly agentLogModel: Model<AgentLogDocument>,
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
    const [machines, orders] = await Promise.all([
      this.machinesService.findAll(undefined, agentId),
      this.ordersService.findAll(undefined, undefined, undefined, agentId),
    ]);

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
  getOrders(agentId: string, status?: string) {
    return this.ordersService.findAll(undefined, undefined, status, agentId);
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
  async walletTopup(agentId: string, dto: AgentTopupDto) {
    const result = await this.walletService.agentTopup(
      agentId,
      dto.targetUserId,
      dto.amount,
      dto.note,
    );
    this.logAction(
      agentId,
      'wallet_topup',
      dto.targetUserId,
      `LKR ${dto.amount}`,
      { amount: dto.amount, note: dto.note },
    ).catch(() => {});
    return result;
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
}
