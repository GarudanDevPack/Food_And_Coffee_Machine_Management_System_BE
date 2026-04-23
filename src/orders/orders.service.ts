import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { RoleEnum } from '../roles/roles.enum';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { WalletService } from '../wallet/wallet.service';
import { MachinesService } from '../machines/machines.service';
import { ItemsService } from '../items/items.service';
import { MqttService } from '../mqtt/mqtt.service';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PromotionsService } from '../promotions/promotions.service';
import { UsersService } from '../users/users.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * Generate a human-readable order reference: ETR-YYYYMMDD_HHMMSS_<rand4>
 * Sent to the machine via MQTT so the hardware can ack back using this ID.
 */
function generateOrderId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, '0');
  return `ETR-${date}_${time}_${rand}`;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly walletService: WalletService,
    private readonly machinesService: MachinesService,
    private readonly itemsService: ItemsService,
    private readonly mqttService: MqttService,
    private readonly membershipsService: MembershipsService,
    private readonly notificationsService: NotificationsService,
    private readonly promotionsService: PromotionsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Place a new order.
   *
   * - Customer (role=5): places for themselves
   * - Agent (role=4): must supply dto.targetUserId; order placed as that customer
   *
   * If the effective customer has an active membership, the discount is
   * automatically applied to totalAmount.
   */
  async placeOrder(
    callerId: string,
    callerRole: RoleEnum,
    dto: CreateOrderDto,
  ): Promise<Order> {
    const isAgent = callerRole === RoleEnum.agent;

    // Resolve the customer for whom the order is placed
    let effectiveUserId = callerId;
    let agentId: string | null = null;

    if (isAgent) {
      if (!dto.targetUserId) {
        throw new BadRequestException(
          'Agents must provide targetUserId to place an order for a customer',
        );
      }
      effectiveUserId = dto.targetUserId;
      agentId = callerId;
    }

    // 1. Verify item availability
    const item = await this.itemsService.findOne(dto.itemId);
    if (!item.isAvailable) {
      throw new BadRequestException('This item is currently not available');
    }

    // 2. Determine price based on item type
    const itemType = (item as any).itemType as string;
    let baseAmount: number;
    let unitPricePerUnit: number;

    if (itemType === 'food') {
      const foodPrice = (item as any).unitPrice as number;
      if (!foodPrice) {
        throw new BadRequestException('Food item has no unit price configured');
      }
      unitPricePerUnit = foodPrice;
      baseAmount = foodPrice * dto.quantity;
    } else {
      // Coffee: cup size selection required
      if (!dto.cupSize) {
        throw new BadRequestException('Cup size is required for coffee items');
      }
      const cupSizeConfig = item.cupSizes.find((cs) => cs.size === dto.cupSize);
      if (!cupSizeConfig) {
        throw new BadRequestException(
          `Cup size "${dto.cupSize}" not available for this item`,
        );
      }
      unitPricePerUnit = cupSizeConfig.price;
      baseAmount = cupSizeConfig.price * dto.quantity;
    }

    // 3. Check machine stock before touching the wallet
    const machine = await this.machinesService.findByMachineId(dto.machineId);
    const isFoodMachine = (machine as any).machineType === 'food';
    const NEAR_EXPIRY_HOURS = 24;
    const NEAR_EXPIRY_DISCOUNT_PCT = 30;
    let nearExpiryDiscountPct = 0;

    if (isFoodMachine) {
      const activeBatch = ((machine as any).batches as any[])?.find(
        (b) =>
          b.itemId === dto.itemId &&
          b.status === 'active' &&
          b.quantity >= dto.quantity,
      );
      if (!activeBatch) {
        throw new BadRequestException(
          'This item is out of stock on this machine',
        );
      }
      // Check if batch is near expiry → apply automatic discount
      if (activeBatch.expiryDate) {
        const hoursUntilExpiry =
          (new Date(activeBatch.expiryDate).getTime() - Date.now()) /
          (1000 * 60 * 60);
        if (hoursUntilExpiry > 0 && hoursUntilExpiry <= NEAR_EXPIRY_HOURS) {
          nearExpiryDiscountPct = NEAR_EXPIRY_DISCOUNT_PCT;
          this.logger.log(
            `Near-expiry batch for item ${dto.itemId} on ${dto.machineId}: ${hoursUntilExpiry.toFixed(1)}h remaining → ${NEAR_EXPIRY_DISCOUNT_PCT}% discount applied`,
          );
        }
      }
    } else {
      const inv = ((machine as any).inventory as any[])?.find(
        (i) => i.itemId === dto.itemId,
      );
      // Verify enough grams remain for the full quantity ordered.
      // Using just currentStock > 0 would accept an order for 2 cups when only
      // 1 cup's worth of grams remain — the machine would dispense 1 then run dry,
      // resulting in a half-completed order and an unnecessary refund experience.
      const gramsNeeded =
        (dto.quantity ?? 1) * (inv?.gramsPerCup > 0 ? inv.gramsPerCup : 18);
      if (!inv || inv.currentStock < gramsNeeded) {
        throw new BadRequestException(
          'Insufficient stock for this order quantity',
        );
      }
    }

    // 3b. Machine must be online and not sleeping
    if ((machine as any).sleepMode === true) {
      throw new BadRequestException('Machine is in sleep mode');
    }
    if (!(machine as any).isOnline) {
      throw new BadRequestException('Machine is currently offline');
    }

    // 3c. Coffee only — boiler must have water (food machines have no water sensor)
    if (!isFoodMachine) {
      const waterLevel = (machine as any).sensor?.water;
      if (waterLevel && waterLevel !== 'present') {
        throw new BadRequestException(
          'Machine boiler has no water — please wait for refill',
        );
      }
    }

    // 3c. Auto-cancel stale pending orders from same user (before queue check)
    await this.orderModel.updateMany(
      { userId: effectiveUserId, machineId: dto.machineId, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          failureReason: 'Auto-cancelled: new order placed',
        },
      },
    );

    // 3d. Reject if machine already processing an active order
    const activeOrder = await this.orderModel.findOne({
      machineId: dto.machineId,
      status: { $in: ['pending', 'dispensing'] },
    });
    if (activeOrder) {
      throw new BadRequestException(
        'Machine is currently processing another order',
      );
    }

    // 4. Apply active membership discount (if any)
    let totalAmount = baseAmount;
    let discountApplied: number | null = null;
    let originalAmount: number | null = null;

    const membership =
      await this.membershipsService.getActiveMembership(effectiveUserId);
    if (membership) {
      const discountPct = (membership as any).discount as number;
      originalAmount = baseAmount;
      totalAmount = Math.round(baseAmount * (1 - discountPct / 100));
      discountApplied = discountPct;
      this.logger.log(
        `Membership discount ${discountPct}% for user ${effectiveUserId}: ${baseAmount} → ${totalAmount} LKR`,
      );
    }

    // 4b. Apply active promotion (best discount wins vs membership)
    let promotionId: string | null = null;
    let promotionDiscount: number | null = null;

    const promotion = await this.promotionsService.findBestPromotion(
      dto.itemId,
    );
    if (promotion) {
      const promoDiscountPct = (promotion as any).discountPct as number;
      // Apply promotion only if it beats the membership discount
      if (!discountApplied || promoDiscountPct > discountApplied) {
        originalAmount = baseAmount;
        totalAmount = Math.round(baseAmount * (1 - promoDiscountPct / 100));
        promotionId = (promotion as any)._id.toString();
        promotionDiscount = promoDiscountPct;
        discountApplied = null; // promotion wins — clear membership flag
        this.logger.log(
          `Promotion discount ${promoDiscountPct}% for item ${dto.itemId}: ${baseAmount} → ${totalAmount} LKR`,
        );
      }
    }

    // 4c. Near-expiry discount (wins if it beats current best discount)
    const currentBestDiscount = promotionDiscount ?? discountApplied ?? 0;
    if (
      nearExpiryDiscountPct > 0 &&
      nearExpiryDiscountPct > currentBestDiscount
    ) {
      originalAmount = baseAmount;
      totalAmount = Math.round(baseAmount * (1 - nearExpiryDiscountPct / 100));
      discountApplied = nearExpiryDiscountPct;
      promotionId = null;
      promotionDiscount = null;
    }

    // 5. Generate human-readable order ID for MQTT correlation
    const orderId = generateOrderId();

    // 6. Persist order record (status = pending until wallet deducted)
    const order = await new this.orderModel({
      orderId,
      userId: effectiveUserId,
      agentId,
      machineId: dto.machineId,
      itemId: dto.itemId,
      itemName: item.name,
      cupSize: dto.cupSize,
      quantity: dto.quantity,
      unitPrice: unitPricePerUnit,
      totalAmount,
      originalAmount,
      discountApplied,
      promotionId,
      promotionDiscount,
      status: 'pending',
    }).save();

    let batchDeducted = false;

    try {
      // 7. Deduct from the effective customer's wallet
      const tx = await this.walletService.deduct(
        effectiveUserId,
        totalAmount,
        order.id,
        dto.cupSize
          ? `Order: ${item.name} (${dto.cupSize} x${dto.quantity})${discountApplied ? ` [-${discountApplied}%]` : ''}`
          : `Order: ${item.name} x${dto.quantity}${discountApplied ? ` [-${discountApplied}%]` : ''}`,
      );

      order.transactionId = tx.id;
      order.status = 'dispensing';
      await order.save();

      // 8. Resolve nozzle + calibration timers BEFORE MQTT publish
      let nozzleId: number | undefined;
      let timerOfWater: number | undefined;
      let timerOfPowder: number | undefined;

      if (isFoodMachine) {
        // FIFO batch deduction — returns the nozzle assigned to this batch
        const batchResult = await this.machinesService.deductBatchStock(
          dto.machineId,
          dto.itemId,
          dto.quantity,
        );
        nozzleId = batchResult.nozzleId;
        batchDeducted = true;
        this.logger.log(
          `[Order] Food machine: nozzle=${nozzleId} item=${item.name} qty=${dto.quantity}`,
        );
      } else {
        // Coffee: look up machine-specific calibration timers for this item + cup size
        const calib = ((machine as any).calibration as any[])?.find(
          (c) => c.itemId === dto.itemId && c.cupSize === dto.cupSize,
        );
        nozzleId = calib?.nozzle;
        timerOfWater = calib?.timerOfWater;
        timerOfPowder = calib?.timerOfPowder;
        this.logger.log(
          `[Order] Coffee machine: nozzle=${nozzleId} item=${item.name} cupSize=${dto.cupSize} ` +
            `water=${timerOfWater ?? 5000}ms powder=${timerOfPowder ?? 3000}ms`,
        );

        // Hardware constraint: water timer must lead powder timer by ≥ 100ms
        if (
          timerOfWater !== undefined &&
          timerOfPowder !== undefined &&
          timerOfWater < timerOfPowder + 100
        ) {
          throw new BadRequestException(
            `Timer mismatch on machine ${dto.machineId}: timerOfWater (${timerOfWater}ms) must be >= timerOfPowder (${timerOfPowder}ms) + 100ms. Update calibration.`,
          );
        }
        // Stock deduction happens ONLY after MQTT confirmation (handleOrderStatusUpdate)
        // to match the physical dispensing — NOT at order placement.
      }

      // 9. Publish MQTT dispense command with correct nozzle + calibrated timers
      try {
        await this.mqttService.dispense(
          dto.machineId,
          dto.itemId,
          dto.cupSize ?? '',
          dto.quantity,
          nozzleId,
          item.name,
          timerOfWater,
          timerOfPowder,
          orderId,
          effectiveUserId,
          isFoodMachine ? 'food' : 'coffee',
        );
      } catch (mqttErr) {
        this.logger.error(
          `MQTT dispense failed for order ${orderId}: ${(mqttErr as Error).message}`,
        );
        order.status = 'failed';
        order.failureReason = 'Machine communication error';
        await order.save();
        await this.walletService.refund(effectiveUserId, totalAmount, orderId);
        throw new ServiceUnavailableException(
          'Machine is not reachable. Payment has been refunded.',
        );
      }

      // 10. Update machine revenue stats
      await this.machinesService.incrementOrderStats(
        dto.machineId,
        totalAmount,
      );

      // Notify customer order is being prepared
      this.notificationsService
        .create(
          effectiveUserId,
          'Order Placed',
          dto.cupSize
            ? `Your order for ${item.name} (${dto.cupSize} x${dto.quantity}) is being prepared.`
            : `Your order for ${item.name} x${dto.quantity} is being prepared.`,
          'order',
          order._id.toString(),
        )
        .catch((e) =>
          this.logger.warn(`Notification failed: ${(e as Error).message}`),
        );

      this.logger.log(
        `Order ${orderId} placed — ${item.name} x${dto.quantity} on ${dto.machineId}` +
          (agentId ? ` by agent ${agentId}` : ''),
      );
      return order;
    } catch (err) {
      // Rollback: mark as failed so UI shows clear status
      order.status = 'failed';
      order.failureReason = (err as Error).message;
      await order.save();

      // Refund wallet only if it was already deducted (transactionId set = money taken)
      if (order.transactionId) {
        await this.walletService
          .refund(effectiveUserId, totalAmount, order._id.toString())
          .catch((e) =>
            this.logger.error(
              `Refund failed for order ${order.orderId}: ${(e as Error).message}`,
            ),
          );
        // Restore food batch if it was deducted before the error
        if (isFoodMachine && batchDeducted) {
          await this.machinesService
            .restoreBatchStock(dto.machineId, dto.itemId, dto.quantity)
            .catch((e) =>
              this.logger.error(
                `Batch restore failed for order ${order.orderId}: ${(e as Error).message}`,
              ),
            );
        }
      }

      throw err;
    }
  }

  async completeOrder(
    orderId: string,
    callerId: string,
    callerRole: RoleEnum,
  ): Promise<Order> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    await this.assertMachineAccess(order.machineId, callerId, callerRole);

    if (!['pending', 'dispensing'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot complete an order with status "${order.status}"`,
      );
    }

    order.status = 'completed';
    const saved = await order.save();

    this.notificationsService
      .create(
        order.userId,
        'Order Completed',
        'Your order has been dispensed! Enjoy.',
        'order',
        orderId,
      )
      .catch((e) =>
        this.logger.warn(`Notification failed: ${(e as Error).message}`),
      );

    return saved;
  }

  async failOrder(
    orderId: string,
    reason: string,
    callerId: string,
    callerRole: RoleEnum,
  ): Promise<Order> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    await this.assertMachineAccess(order.machineId, callerId, callerRole);

    // Auto-refund wallet if payment was already deducted
    let refunded = false;
    if (order.status === 'dispensing') {
      await this.walletService.refund(order.userId, order.totalAmount, orderId);
      refunded = true;
    }

    order.status = 'failed';
    order.failureReason = reason;
    const saved = await order.save();

    const notifMsg = refunded
      ? `Order failed. ${order.totalAmount} LKR has been refunded to your wallet.`
      : 'Your order could not be completed.';
    this.notificationsService
      .create(order.userId, 'Order Failed', notifMsg, 'order', orderId)
      .catch((e) =>
        this.logger.warn(`Notification failed: ${(e as Error).message}`),
      );

    return saved;
  }

  /**
   * Look up an order by its human-readable orderId (e.g. ETR-20260313_143052_0042).
   * Used to correlate MQTT machine ack messages back to the database record.
   */
  async findByOrderStringId(orderId: string): Promise<Order | null> {
    return this.orderModel.findOne({ orderId }).exec();
  }

  /**
   * Machine-access guard:
   * - super_admin / admin → bypass (can act on any machine's orders)
   * - agent → must be the assigned agent for that machine
   */
  private async assertMachineAccess(
    machineId: string,
    callerId: string,
    callerRole: RoleEnum,
  ): Promise<void> {
    if (callerRole === RoleEnum.super_admin || callerRole === RoleEnum.admin) {
      return;
    }

    const machine = await this.machinesService
      .findByMachineId(machineId)
      .catch(() => null);

    if (!machine) {
      throw new NotFoundException(`Machine ${machineId} not found`);
    }

    if ((machine as any).agentId !== callerId) {
      throw new ForbiddenException(
        'You can only update orders for machines assigned to you',
      );
    }
  }

  async refundOrder(orderId: string): Promise<Order> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status === 'refunded') {
      throw new BadRequestException('Order already refunded');
    }

    await this.walletService.refund(order.userId, order.totalAmount, orderId);
    order.status = 'refunded';
    return order.save();
  }

  async findAll(
    userId?: string,
    machineId?: string,
    status?: string,
    agentId?: string,
  ): Promise<Order[]> {
    const filter: Record<string, string> = {};
    if (userId) filter.userId = userId;
    if (machineId) filter.machineId = machineId;
    if (status) filter.status = status;
    if (agentId) filter.agentId = agentId;
    return this.orderModel.find(filter).sort({ createdAt: -1 }).lean().exec();
  }

  async findMyOrders(userId: string): Promise<Order[]> {
    return this.orderModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderModel.findById(id).lean().exec();
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  // ─── Legacy / Machine-facing methods ─────────────────────────────────────────

  /**
   * Machine polls for its next pending order.
   * GET /getlastorderbymachine?machine_id=
   */
  async getActiveOrderForMachine(machineId: string): Promise<Order | null> {
    return this.orderModel
      .findOne({ machineId, status: { $in: ['pending', 'dispensing'] } })
      .sort({ createdAt: 1 })
      .exec();
  }

  /**
   * User checks their current order on a specific machine.
   * GET /getorderbyuser?machine_id=&user_id=
   */
  async getActiveOrderForUser(
    machineId: string,
    userId: string,
  ): Promise<Order | null> {
    return this.orderModel
      .findOne({
        machineId,
        userId,
        status: { $in: ['pending', 'dispensing'] },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Machine reports dispensing result back to server.
   * PUT /updateorderbymachine  { id: "ETR-...", status: "completed"|"cancelled"|"processing", error? }
   */
  async machineUpdateOrder(
    orderId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    const order = await this.orderModel.findOne({ orderId }).exec();
    if (!order) return; // stale ack — ignore silently

    const prevStatus = order.status;

    if (status === 'completed') {
      order.status = 'completed';
      this.notificationsService
        .create(
          order.userId,
          'Order Completed',
          'Your order has been dispensed!',
          'order',
          order._id.toString(),
        )
        .catch(() => null);
    } else if (status === 'cancelled') {
      order.status = 'failed';
      order.failureReason = error ?? 'Machine cancelled the order';
      if (prevStatus === 'dispensing') {
        await this.walletService.refund(
          order.userId,
          order.totalAmount,
          order._id.toString(),
        );
        this.notificationsService
          .create(
            order.userId,
            'Order Failed',
            `Order failed. ${order.totalAmount} LKR refunded.`,
            'order',
            order._id.toString(),
          )
          .catch(() => null);
      }
    } else {
      // processing / half-completed — keep order alive, update status
      order.status = status;
    }

    if (error) order.failureReason = error;
    await order.save();
  }

  /**
   * Legacy order creation — accepts old mobile app format.
   * POST /createorder
   * Body: { user: { id: <mongoUserId> }, machine_id, items: [{item_id, item_name, vol, qty, nozzle}], amount, currency? }
   */
  async legacyPlaceOrder(body: any): Promise<any> {
    const { user, machine_id, items, amount, currency = 'LKR' } = body;

    if (!user?.id || !machine_id || !items?.length || amount == null) {
      throw new BadRequestException(
        'user.id, machine_id, items, and amount are required',
      );
    }

    // Cancel stale pending orders from same user on this machine
    await this.orderModel.updateMany(
      { userId: user.id, machineId: machine_id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          failureReason: 'Auto-cancelled: new order placed',
        },
      },
    );

    // Verify machine exists and is online
    const machine = await this.machinesService
      .findByMachineId(machine_id)
      .catch(() => null);
    if (!machine) {
      throw new NotFoundException(`Machine ${machine_id} not found`);
    }
    if (!(machine as any).isOnline) {
      throw new BadRequestException('Machine is currently offline');
    }

    const machineTypeLegacy: 'coffee' | 'food' =
      (machine as any).machineType ?? 'coffee';

    // Coffee only — boiler must have water (food machines have no water sensor)
    if (machineTypeLegacy !== 'food') {
      const waterLevel = (machine as any).sensor?.water;
      if (waterLevel && waterLevel !== 'present') {
        throw new BadRequestException(
          'Machine boiler has no water — please wait for refill',
        );
      }
    }

    // Reject if machine already has an active order
    const busyOrder = await this.orderModel.findOne({
      machineId: machine_id,
      status: { $in: ['pending', 'dispensing'] },
    });
    if (busyOrder) {
      throw new BadRequestException('Machine is busy. Please wait.');
    }

    // Resolve CUS-format ID (CUS-YYYYMMDD-HHMMSS) → MongoDB ObjectId for wallet lookup
    let effectiveUserId = user.id;
    if (user.id?.startsWith('CUS-')) {
      const userRecord = await this.usersService
        .findByCustomerId(user.id)
        .catch(() => null);
      if (userRecord) effectiveUserId = (userRecord as any)._id.toString();
    }

    this.logger.log(
      `[Order] Checking wallet for user ${user.id} (effectiveId=${effectiveUserId}), amount: ${amount} ${currency}`,
    );

    // Deduct wallet
    const tx = await this.walletService.deduct(
      effectiveUserId,
      amount,
      `legacy-${Date.now()}`,
      `Order on machine ${machine_id}`,
    );

    this.logger.log(
      `[Order] Wallet deduction successful: previous=${(tx as any).balanceBefore} → new=${(tx as any).balanceAfter} (deducted ${amount} ${currency})`,
    );

    // Build order record from old format
    const orderId = generateOrderId();
    const firstItem = items[0];
    const order = await new this.orderModel({
      orderId,
      userId: effectiveUserId,
      machineId: machine_id,
      itemId: firstItem.item_id,
      itemName: firstItem.item_name,
      cupSize: firstItem.vol ?? null,
      quantity: firstItem.qty ?? 1,
      unitPrice: amount / (firstItem.qty || 1),
      totalAmount: amount,
      currency,
      status: 'dispensing',
      transactionId: tx.id,
    }).save();

    this.logger.log(
      `[Order] Order created: ${orderId} | machine=${machine_id} | user=${user.id} | items=${items.length}`,
    );

    const machineType = machineTypeLegacy;
    const calibration: any[] = (machine as any).calibration ?? [];

    // Normalize vol string to match either "90" or "90ml" stored in calibration
    const normalizeVol = (vol: string) => vol.replace(/ml/i, '').trim();

    // Build comma-separated ord string for ALL items (matches old backend multi-item format)
    const ordParts = (items as any[]).map((item: any) => {
      const volNorm = normalizeVol(item.vol ?? '');
      // Match calibration by itemId + cupSize — handles both "90" and "90ml" stored formats
      const calib = calibration.find(
        (c: any) =>
          c.itemId === item.item_id &&
          (c.cupSize === item.vol || normalizeVol(c.cupSize ?? '') === volNorm),
      );
      const noz = item.nozzle ?? calib?.nozzle ?? 1;
      const tw = calib?.timerOfWater ?? 5000;
      const tp = calib?.timerOfPowder ?? 3000;

      this.logger.log(
        `[Order] Item: nozzle=${noz} name=${item.item_name} qty=${item.qty ?? 1} ` +
          (machineType === 'food' ? '' : `water=${tw}ms powder=${tp}ms`),
      );

      return machineType === 'food'
        ? `N${noz}-${item.item_name}-${item.qty ?? 1}-`
        : `N${noz}-${item.item_name}-${item.qty ?? 1}-${tw}-${tp}`;
    });

    const ordStr = ordParts.join(',');
    this.logger.log(`[Order] MQTT ord string: ${ordStr}`);

    // Hardware constraint for coffee: water timer must lead powder by ≥ 100ms
    if (machineType === 'coffee') {
      const volNorm = normalizeVol(firstItem.vol ?? '');
      const firstCalib = calibration.find(
        (c: any) =>
          c.itemId === firstItem.item_id &&
          (c.cupSize === firstItem.vol ||
            normalizeVol(c.cupSize ?? '') === volNorm),
      );
      const tw = firstCalib?.timerOfWater ?? 5000;
      const tp = firstCalib?.timerOfPowder ?? 3000;
      if (tw < tp + 100) {
        throw new BadRequestException(
          `Timer mismatch: timerOfWater (${tw}ms) must be >= timerOfPowder (${tp}ms) + 100ms. Update calibration for machine ${machine_id}.`,
        );
      }
    }

    try {
      // Publish with same command wrapper the firmware expects
      // QoS 0 — matches old backend (publishMachineCommand default)
      await this.mqttService.publish(
        `machine/order/${machine_id}`,
        {
          command: {
            ord_id: orderId,
            user: user.id, // Send original CUS-... ID so machine can display it
            ord: ordStr,
            status: 'pending',
          },
        },
        { qos: 0 },
      );
      this.logger.log(
        `[Order] MQTT command sent → machine/order/${machine_id} | orderId=${orderId}`,
      );
    } catch (mqttErr) {
      this.logger.error(
        `MQTT dispense failed for legacy order ${orderId}: ${(mqttErr as Error).message}`,
      );
      order.status = 'failed';
      order.failureReason = 'Machine communication error';
      await order.save();
      await this.walletService.refund(effectiveUserId, amount, orderId);
      throw new ServiceUnavailableException(
        'Machine is not reachable. Payment has been refunded.',
      );
    }

    this.logger.log(
      `[Order] ✓ Legacy order complete: ${orderId} | machine=${machine_id} | user=${user.id} | ${machineType} machine`,
    );

    return {
      success: true,
      message: 'Order created successfully, wallet updated',
      data: order,
      wallet_info: {
        previous_balance: (tx as any).balanceBefore,
        new_balance: (tx as any).balanceAfter,
        deducted_amount: amount,
        currency,
      },
    };
  }
}
