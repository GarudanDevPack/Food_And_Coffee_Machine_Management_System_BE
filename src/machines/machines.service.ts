import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Machine, MachineDocument } from './schemas/machine.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import {
  MqttService,
  MachineStatusPayload,
  OrderStatusPayload,
} from '../mqtt/mqtt.service';
import { WalletService } from '../wallet/wallet.service';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import {
  UpdateMachineDto,
  UpdateInventoryDto,
  UpdateCalibrationDto,
} from './dto/update-machine.dto';
import { LoadBatchDto } from './dto/load-batch.dto';

@Injectable()
export class MachinesService implements OnModuleInit {
  private readonly logger = new Logger(MachinesService.name);

  constructor(
    @InjectModel(Machine.name)
    private readonly machineModel: Model<MachineDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    private readonly mqttService: MqttService,
    private readonly walletService: WalletService,
    private readonly alertsService: AlertsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Register MQTT callbacks once the module is fully initialised.
   * This wires live machine status and order status updates from hardware.
   */
  onModuleInit(): void {
    this.mqttService.onMachineStatusUpdate((payload) =>
      this.handleMachineStatusUpdate(payload),
    );
    this.mqttService.onOrderStatusUpdate((payload) =>
      this.handleOrderStatusUpdate(payload),
    );
    this.logger.log('MQTT callbacks registered');
  }

  // ─── MQTT Handlers ──────────────────────────────────────────────────────────

  /**
   * Handles machine/status/update MQTT messages.
   * Updates: isOnline, lastSeen, sensor readings, error flag.
   */
  private async handleMachineStatusUpdate(
    payload: MachineStatusPayload,
  ): Promise<void> {
    try {
      const update: Record<string, any> = {
        isOnline: payload.status !== 'offline',
        lastSeen: new Date(),
      };
      if (payload.error !== undefined) update.error = payload.error;
      if (payload.sensor) update.sensor = payload.sensor;

      await this.machineModel.updateOne(
        { machineId: payload.machine_id },
        { $set: update },
      );
      this.logger.debug(
        `Machine ${payload.machine_id} status → ${payload.status ?? 'update'}`,
      );

      if (payload.status === 'offline') {
        const alertMsg = `Machine ${payload.machine_id} went offline`;
        await this.alertsService.create({
          machineId: payload.machine_id,
          type: 'machine_offline',
          severity: 'high',
          message: alertMsg,
        });
        await this.notificationsService.create(
          'system',
          'Machine Offline',
          alertMsg,
          'alert',
          payload.machine_id,
        );
      }

      // Temperature threshold check
      if (payload.sensor?.temp != null) {
        const machine = await this.machineModel
          .findOne({ machineId: payload.machine_id })
          .select('temperatureThreshold')
          .exec();
        if (
          machine?.temperatureThreshold &&
          payload.sensor.temp > machine.temperatureThreshold
        ) {
          const tempMsg = `Machine ${payload.machine_id} temperature ${payload.sensor.temp}°C exceeds threshold ${machine.temperatureThreshold}°C`;
          await this.alertsService.create({
            machineId: payload.machine_id,
            type: 'temperature_high',
            severity: 'critical',
            message: tempMsg,
          });
          await this.notificationsService.create(
            'system',
            'Temperature Alert',
            tempMsg,
            'alert',
            payload.machine_id,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle machine status update: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Handles machine/order/status MQTT messages.
   * Matches by orderId (human-readable ETR-... string), then:
   * - completed → marks order completed
   * - cancelled → marks order failed + auto-refunds wallet
   * - processing / half-completed → logged only (machine still working)
   */
  private async handleOrderStatusUpdate(
    payload: OrderStatusPayload,
  ): Promise<void> {
    try {
      const order = await this.orderModel
        .findOne({ orderId: payload.id })
        .exec();
      if (!order) {
        this.logger.warn(
          `Order status update received for unknown orderId: ${payload.id}`,
        );
        return;
      }

      if (payload.status === 'completed') {
        order.status = 'completed';
        await order.save();
        this.logger.log(`Order ${payload.id} marked completed via MQTT`);
      } else if (payload.status === 'cancelled') {
        // Refund wallet if payment was deducted
        if (order.status === 'dispensing') {
          await this.walletService.refund(
            order.userId,
            order.totalAmount,
            order._id.toString(),
          );
          this.logger.log(
            `Refunded ${order.totalAmount} LKR to user ${order.userId} for cancelled order ${payload.id}`,
          );
        }
        order.status = 'failed';
        order.failureReason = 'Machine cancelled the order';
        await order.save();
      } else {
        this.logger.debug(
          `Order ${payload.id} status: ${payload.status} (no DB action)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to handle order status update: ${(err as Error).message}`,
      );
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateMachineDto): Promise<Machine> {
    if (!dto.machineId) {
      // Auto-generate: cm_ prefix for coffee, vd_ prefix for food/vending
      const ts = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 10);
      const prefix = dto.machineType === 'food' ? 'vd' : 'cm';
      (dto as any).machineId = `${prefix}_${ts}_${rand}`;
    }
    const machine = new this.machineModel(dto);
    return machine.save();
  }

  async findAll(
    clientId?: string,
    agentId?: string,
    orgId?: string,
  ): Promise<Machine[]> {
    const filter: Record<string, string> = {};
    if (clientId) filter.clientId = clientId;
    if (agentId) filter.agentId = agentId;
    if (orgId) filter.orgId = orgId;
    return this.machineModel.find(filter).lean().exec();
  }

  async findOne(id: string): Promise<Machine> {
    const machine = await this.machineModel.findById(id).lean().exec();
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async findByMachineId(machineId: string): Promise<Machine> {
    const machine = await this.machineModel
      .findOne({ machineId })
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);
    return machine;
  }

  async update(id: string, dto: UpdateMachineDto): Promise<Machine> {
    const machine = await this.machineModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async remove(id: string): Promise<void> {
    const result = await this.machineModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Machine ${id} not found`);
  }

  async updateInventory(
    machineId: string,
    dto: UpdateInventoryDto,
  ): Promise<Machine> {
    const machine = await this.machineModel.findOne({ machineId }).exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);

    const idx = machine.inventory.findIndex((i) => i.itemId === dto.itemId);
    if (idx >= 0) {
      machine.inventory[idx].currentStock = dto.currentStock;
      if (dto.minStock !== undefined)
        machine.inventory[idx].minStock = dto.minStock;
    } else {
      machine.inventory.push({
        itemId: dto.itemId,
        currentStock: dto.currentStock,
        minStock: dto.minStock ?? 5,
        nozzle: dto.nozzle ?? 1,
        gramsPerCup: dto.gramsPerCup ?? 18,
      });
    }
    return (await machine.save()).toObject();
  }

  async updateCalibration(
    machineId: string,
    dto: UpdateCalibrationDto,
  ): Promise<Machine> {
    const machine = await this.machineModel.findOne({ machineId }).exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);

    // Auto-compute timers from physical volume measurements if provided
    // Formula from old volumeController: powder=6g/sec, water=18.5ml/sec, unit=1000ms
    if (dto.volGram && dto.volGram > 0) {
      dto.timerOfPowder = Math.round((dto.volGram / 6) * 1000);
    }
    if (dto.volMl && dto.volMl > 0) {
      dto.timerOfWater = Math.round((dto.volMl / 18.5) * 1000);
    }

    // Hardware constraint: water timer must lead powder timer by ≥ 100ms
    if (dto.timerOfWater !== undefined && dto.timerOfPowder !== undefined) {
      if (dto.timerOfWater < dto.timerOfPowder + 100) {
        throw new BadRequestException(
          `timerOfWater (${dto.timerOfWater}ms) must be at least 100ms greater than timerOfPowder (${dto.timerOfPowder}ms)`,
        );
      }
    }

    const idx = machine.calibration.findIndex(
      (c) => c.itemId === dto.itemId && c.cupSize === dto.cupSize,
    );
    if (idx >= 0) {
      machine.calibration[idx] = { ...machine.calibration[idx], ...dto };
    } else {
      machine.calibration.push({
        itemId: dto.itemId,
        nozzle: dto.nozzle ?? 1,
        timerOfPowder: dto.timerOfPowder,
        timerOfWater: dto.timerOfWater,
        cupSize: dto.cupSize,
        volMl: dto.volMl ?? 0,
        volGram: dto.volGram ?? 0,
      });
    }

    // Push new calibration to machine hardware via MQTT
    this.mqttService.calibrate(machineId, dto);
    return (await machine.save()).toObject();
  }

  async triggerManualFlush(
    machineId: string,
    type: 'daily' | 'weekly',
  ): Promise<{ message: string }> {
    await this.findByMachineId(machineId);
    this.mqttService.flush(machineId, type);
    this.logger.log(
      `Manual flush triggered for machine ${machineId} (${type})`,
    );
    return { message: `Flush command sent to machine ${machineId}` };
  }

  // Auto-flush daily at 2:00 AM Asia/Colombo
  @Cron('30 20 * * *', { timeZone: 'Asia/Colombo' })
  async dailyFlush(): Promise<void> {
    this.logger.log('Running daily flush for all active machines...');
    const machines = await this.machineModel
      .find({ status: 'active', autoFlushEnabled: true })
      .select('machineId')
      .exec();
    const ids = machines.map((m) => m.machineId);
    this.mqttService.flushAll(ids, 'daily');
    this.logger.log(`Daily flush sent to ${ids.length} machines`);
  }

  // Auto-flush weekly every Sunday at 3:00 AM Asia/Colombo
  @Cron('0 3 * * 0', { timeZone: 'Asia/Colombo' })
  async weeklyFlush(): Promise<void> {
    this.logger.log('Running weekly flush for all active machines...');
    const machines = await this.machineModel
      .find({ status: 'active', autoFlushEnabled: true })
      .select('machineId')
      .exec();
    const ids = machines.map((m) => m.machineId);
    this.mqttService.flushAll(ids, 'weekly');
    this.logger.log(`Weekly flush sent to ${ids.length} machines`);
  }

  async deductStock(
    machineId: string,
    itemId: string,
    quantity: number,
  ): Promise<void> {
    // Atomic deduction — the $gte filter prevents negative stock under concurrent orders
    const updated = await this.machineModel
      .findOneAndUpdate(
        {
          machineId,
          'inventory.itemId': itemId,
          'inventory.currentStock': { $gte: quantity },
        },
        { $inc: { 'inventory.$.currentStock': -quantity } },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        `Insufficient stock for item ${itemId} on machine ${machineId}`,
      );
    }

    // Check if stock dropped to or below minStock and fire alert if so
    const machine = updated;
    if (machine) {
      const inv = machine.inventory.find((i) => i.itemId === itemId);
      if (inv && inv.currentStock <= inv.minStock) {
        const alert = await this.alertsService.createLowStockAlert(
          machineId,
          itemId,
          inv.currentStock,
        );
        await this.notificationsService.create(
          'system',
          'Low Stock Alert',
          alert.message,
          'alert',
          machineId,
        );
      }
    }
  }

  async incrementOrderStats(machineId: string, amount: number): Promise<void> {
    await this.machineModel.updateOne(
      { machineId },
      { $inc: { totalOrders: 1, totalRevenue: amount } },
    );
  }

  // ─── Food Batch Management ───────────────────────────────────────────────────

  /**
   * Agent loads a new stock batch onto a food machine.
   * Generates a unique batchId (BCH-YYYYMMDD-HHMMSS) and pushes to batches[].
   */
  async loadBatch(
    machineId: string,
    agentId: string,
    dto: LoadBatchDto,
  ): Promise<Machine> {
    const machine = await this.findByMachineId(machineId);
    if ((machine as any).machineType !== 'food') {
      throw new BadRequestException(
        'Batch management is only for food machines',
      );
    }

    const now = new Date();
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const batchId = `BCH-${datePart}-${timePart}`;

    await this.machineModel.updateOne(
      { machineId },
      {
        $push: {
          batches: {
            batchId,
            itemId: dto.itemId,
            itemName: dto.itemName,
            nozzleId: dto.nozzleId,
            quantity: dto.quantity,
            totalQty: dto.quantity,
            expiryDate: new Date(dto.expiryDate),
            loadedAt: now,
            loadedBy: agentId,
            status: 'active',
          },
        },
      },
    );

    this.logger.log(
      `Batch ${batchId} loaded on machine ${machineId} by agent ${agentId} (${dto.quantity}x ${dto.itemName})`,
    );
    return this.findByMachineId(machineId);
  }

  /**
   * List batches for a food machine, optionally filtered by status.
   */
  async getBatches(
    machineId: string,
    status?: string,
  ): Promise<Machine['batches']> {
    const machine = await this.findByMachineId(machineId);
    const batches = (machine as any).batches as Machine['batches'];
    if (status) return batches.filter((b) => b.status === status);
    return batches;
  }

  /**
   * Returns active batches on a food machine that are expiring within the given
   * threshold (default 24 hours). Used by the customer UI to show a near-expiry
   * discount badge before placing an order.
   *
   * @param machineId      - Human-readable machine ID (e.g. MCH-001)
   * @param hoursThreshold - Hours within which a batch is considered "near expiry"
   */
  async getNearExpiryItems(
    machineId: string,
    hoursThreshold = 24,
  ): Promise<
    {
      itemId: string;
      itemName: string;
      batchId: string;
      expiryDate: Date;
      hoursRemaining: number;
      discountPct: number;
      quantity: number;
    }[]
  > {
    const machine = await this.findByMachineId(machineId);
    const batches = ((machine as any).batches ?? []) as any[];
    const now = Date.now();
    const thresholdMs = hoursThreshold * 60 * 60 * 1000;

    return batches
      .filter((b) => {
        if (b.status !== 'active' || b.quantity <= 0 || !b.expiryDate)
          return false;
        const msUntilExpiry = new Date(b.expiryDate).getTime() - now;
        return msUntilExpiry > 0 && msUntilExpiry <= thresholdMs;
      })
      .map((b) => ({
        itemId: b.itemId,
        itemName: b.itemName,
        batchId: b.batchId,
        expiryDate: b.expiryDate,
        hoursRemaining: parseFloat(
          ((new Date(b.expiryDate).getTime() - now) / (1000 * 60 * 60)).toFixed(
            1,
          ),
        ),
        discountPct: 30,
        quantity: b.quantity,
      }));
  }

  /**
   * Remove a batch from a food machine.
   */
  async removeBatch(machineId: string, batchId: string): Promise<Machine> {
    const machine = await this.findByMachineId(machineId);
    const exists = (machine as any).batches?.some(
      (b: any) => b.batchId === batchId,
    );
    if (!exists) {
      throw new NotFoundException(
        `Batch ${batchId} not found on machine ${machineId}`,
      );
    }

    await this.machineModel.updateOne(
      { machineId },
      { $pull: { batches: { batchId } } },
    );
    return this.findByMachineId(machineId);
  }

  /**
   * FIFO batch stock deduction for food machine orders.
   * Picks the oldest active batch for the given item, decrements quantity.
   * Marks batch as 'depleted' when quantity reaches 0.
   * Returns the nozzleId of the batch used (for MQTT dispense targeting).
   */
  async deductBatchStock(
    machineId: string,
    itemId: string,
    quantity: number,
  ): Promise<{ nozzleId: number }> {
    const machine = await this.findByMachineId(machineId);
    const batches = (machine as any).batches as Machine['batches'];

    // FIFO: find oldest active batch with enough stock
    const activeBatches = batches
      .filter(
        (b) =>
          b.itemId === itemId &&
          b.status === 'active' &&
          b.quantity >= quantity,
      )
      .sort(
        (a, b) =>
          new Date(a.loadedAt).getTime() - new Date(b.loadedAt).getTime(),
      );

    if (activeBatches.length === 0) {
      throw new BadRequestException(
        'This item is out of stock on this machine',
      );
    }

    const batch = activeBatches[0];
    const newQty = batch.quantity - quantity;

    await this.machineModel.updateOne(
      { machineId, 'batches.batchId': batch.batchId },
      {
        $set: {
          'batches.$.quantity': newQty,
          ...(newQty <= 0 ? { 'batches.$.status': 'depleted' } : {}),
        },
      },
    );

    this.logger.log(
      `Batch ${batch.batchId} deducted: ${batch.quantity} → ${newQty} (${batch.itemName} on ${machineId})`,
    );
    return { nozzleId: batch.nozzleId };
  }

  // ─── Sleep Mode ──────────────────────────────────────────────────────────────

  /**
   * Put a machine into sleep mode or wake it.
   * Sends MQTT command to machine/log/{machineId} matching old backend format.
   */
  async setSleepMode(machineId: string, sleep: boolean): Promise<Machine> {
    const machine = await this.machineModel
      .findOneAndUpdate(
        { machineId },
        { $set: { sleepMode: sleep } },
        { new: true },
      )
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);

    if (sleep) {
      this.mqttService.sleep(machineId);
    } else {
      this.mqttService.wake(machineId);
    }
    this.logger.log(`Machine ${machineId} sleep mode → ${sleep}`);
    return machine;
  }

  // ─── Item Assignment ─────────────────────────────────────────────────────────

  /**
   * Assign an item to a machine's item list.
   * Items in this list appear on the mobile menu even before stock is loaded.
   */
  async assignItem(machineId: string, itemId: string): Promise<Machine> {
    const machine = await this.machineModel
      .findOneAndUpdate(
        { machineId },
        { $addToSet: { itemIds: itemId } },
        { new: true },
      )
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);
    this.logger.log(`Item ${itemId} assigned to machine ${machineId}`);
    return machine;
  }

  /**
   * Remove an item from a machine's item list.
   */
  async removeItem(machineId: string, itemId: string): Promise<Machine> {
    const machine = await this.machineModel
      .findOneAndUpdate(
        { machineId },
        { $pull: { itemIds: itemId } },
        { new: true },
      )
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);
    return machine;
  }

  // ─── Mobile Menu ─────────────────────────────────────────────────────────────

  /**
   * Returns the full menu for a machine — all assigned items with stock status,
   * pricing, and machine-specific calibration timers.
   * Equivalent to old getMachineMobile(). Public endpoint — no auth required.
   */
  async getMachineMenu(machineId: string): Promise<object[]> {
    const machine = await this.findByMachineId(machineId);
    const isFoodMachine = (machine as any).machineType === 'food';

    // Collect item IDs: explicit assignment + inventory/batch fallback
    const assignedIds: string[] = (machine as any).itemIds ?? [];
    const inventoryIds: string[] = isFoodMachine
      ? ((machine as any).batches as any[])
          .filter((b) => b.status === 'active')
          .map((b) => b.itemId)
      : ((machine as any).inventory as any[]).map((i) => i.itemId);

    const allIds = [...new Set([...assignedIds, ...inventoryIds])];
    if (allIds.length === 0) return [];

    const items = await this.itemModel
      .find({ _id: { $in: allIds }, isAvailable: true })
      .exec();

    return items.map((item) => {
      const id = item._id.toString();

      // Stock: coffee = inventory currentStock, food = sum of active batch quantities
      const inv = ((machine as any).inventory as any[])?.find(
        (i) => i.itemId === id,
      );
      const activeBatches = (((machine as any).batches as any[]) ?? []).filter(
        (b) => b.itemId === id && b.status === 'active',
      );
      const currentStock =
        inv?.currentStock ??
        activeBatches.reduce((s: number, b: any) => s + b.quantity, 0);

      // Enrich coffee cup sizes with machine-specific calibration timers
      const cupSizes = item.cupSizes.map((cs) => {
        const calib = (((machine as any).calibration as any[]) ?? []).find(
          (c) => c.itemId === id && c.cupSize === cs.size,
        );
        return {
          size: cs.size,
          price: cs.price,
          timerOfPowder: calib?.timerOfPowder ?? cs.timerOfPowder,
          timerOfWater: calib?.timerOfWater ?? cs.timerOfWater,
        };
      });

      return {
        _id: item._id,
        name: item.name,
        description: item.description ?? null,
        category: item.category ?? null,
        imageUrl: item.imageUrl ?? null,
        itemType: (item as any).itemType,
        unitPrice: (item as any).unitPrice ?? null,
        cupSizes,
        currentStock,
        inStock: currentStock > 0,
        bayesianRating: item.bayesianRating,
      };
    });
  }

  /**
   * Hourly cron: scan all food machines for batches past their expiry date.
   * Marks them as 'expired' and fires an alert per expired batch.
   */
  @Cron('0 * * * *', { timeZone: 'Asia/Colombo' })
  async checkBatchExpiry(): Promise<void> {
    const now = new Date();
    const machines = await this.machineModel
      .find({
        machineType: 'food',
        'batches.status': 'active',
        'batches.expiryDate': { $lt: now },
      })
      .exec();

    if (machines.length === 0) return;

    for (const machine of machines) {
      const expiredBatches = (machine as any).batches.filter(
        (b: any) => b.status === 'active' && new Date(b.expiryDate) < now,
      );

      // Mark expired using arrayFilters
      await this.machineModel.updateOne(
        { _id: machine._id },
        { $set: { 'batches.$[elem].status': 'expired' } },
        {
          arrayFilters: [
            { 'elem.status': 'active', 'elem.expiryDate': { $lt: now } },
          ],
        },
      );

      for (const batch of expiredBatches) {
        const msg = `Batch ${batch.batchId} (${batch.itemName}) expired on machine ${(machine as any).machineId}`;
        await this.alertsService.create({
          machineId: (machine as any).machineId,
          type: 'batch_expired',
          severity: 'high',
          message: msg,
        });
        await this.notificationsService.create(
          'system',
          'Batch Expired',
          msg,
          'alert',
          (machine as any).machineId,
        );
        this.logger.warn(msg);
      }
    }
  }

  /**
   * Runs every 30 seconds.
   * Any order still in 'pending' or 'dispensing' state after 30 seconds is
   * automatically cancelled and the wallet is refunded.
   */
  @Cron('*/30 * * * * *')
  async cancelTimedOutOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - 30_000);

    const stuckOrders = await this.orderModel
      .find({
        status: { $in: ['pending', 'dispensing'] },
        createdAt: { $lt: cutoff },
      })
      .exec();

    for (const order of stuckOrders) {
      order.status = 'cancelled';
      order.failureReason =
        'Order timed out — no response from machine within 30 seconds';
      await order.save();

      await this.walletService
        .refund(order.userId, order.totalAmount, order._id.toString())
        .catch((err) =>
          this.logger.error(
            `Refund failed for timed-out order ${order.orderId}: ${(err as Error).message}`,
          ),
        );

      this.logger.warn(
        `Order ${order.orderId} auto-cancelled after 30s timeout on machine ${order.machineId}`,
      );
    }
  }
}
