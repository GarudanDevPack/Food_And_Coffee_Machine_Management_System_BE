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
import { EventsGateway } from '../events/events.gateway';

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
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Register MQTT callbacks once the module is fully initialised.
   * This wires live machine status and order status updates from hardware.
   */
  async onModuleInit(): Promise<void> {
    // Clear any stuck flushMode flags left over from a crashed/restarted process
    const stuck = await this.machineModel.updateMany(
      { flushMode: true },
      { $set: { flushMode: false } },
    );
    if (stuck.modifiedCount > 0) {
      this.logger.warn(
        `Reset flushMode=true on ${stuck.modifiedCount} machine(s) left over from previous process`,
      );
    }

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
      // Detect sleep acknowledgement from firmware:
      // Machine sends { status:"offline", error:"Sleep_Mode_ON" } when it enters sleep.
      // This is NOT a real offline — treat it as a sleep state change.
      const isSleepAck = payload.error === 'Sleep_Mode_ON';

      const update: Record<string, any> = {
        // Machine is online if status is not offline, OR if this is a sleep ack
        // (sleeping machine is intentionally "offline" on MQTT but still operational)
        isOnline: isSleepAck ? false : payload.status !== 'offline',
        lastSeen: new Date(),
      };

      if (isSleepAck) {
        // Firmware confirmed sleep mode — mark DB accordingly
        update.sleepMode = true;
        update.error = 'Sleep_Mode_ON';
        this.logger.log(`Machine ${payload.machine_id} confirmed sleep mode`);
      } else {
        if (payload.error !== undefined) update.error = payload.error;
        if (payload.status === 'online') {
          // Clear the retained wake message only on the transition from offline → online.
          // We check isOnline (not sleepMode) because setSleepMode(false) already clears
          // sleepMode in DB before the machine sends its first heartbeat — so sleepMode
          // would always be false here and the old check never fired.
          const existing = await this.machineModel
            .findOne({ machineId: payload.machine_id }, { isOnline: 1 })
            .lean()
            .exec();
          if (existing && (existing as any).isOnline === false) {
            this.mqttService.clearRetainedWake(payload.machine_id);
            this.logger.log(
              `Machine ${payload.machine_id} came online — cleared retained wake message`,
            );
          }
          update.sleepMode = false;
        }
      }

      if (payload.sensor) {
        // Firmware sends RAW sensor pin state:
        //   "LOW"  = pin pulled LOW by water = boiler HAS water → "present"
        //   "HIGH" = pin floating (no water)  = boiler EMPTY    → "empty"
        //   "Non"  = sensor not reading (machine in sleep)       → "unknown"
        const rawWater = payload.sensor.water;
        const normalisedWater =
          rawWater === 'LOW'
            ? 'present'
            : rawWater === 'HIGH'
              ? 'empty'
              : rawWater === 'Non'
                ? 'unknown'
                : rawWater;
        update.sensor = { ...payload.sensor, water: normalisedWater };
      }

      await this.machineModel.updateOne(
        { machineId: payload.machine_id },
        { $set: update },
      );
      this.logger.debug(
        `Machine ${payload.machine_id} status → ${payload.status ?? 'update'}${isSleepAck ? ' (sleep ack)' : ''}`,
      );

      // Push live status to all connected browser clients
      this.eventsGateway.emitMachineStatus({
        machineId: payload.machine_id,
        isOnline: update.isOnline,
        sleepMode: update.sleepMode,
        flushMode: update.flushMode,
        error: update.error,
        sensor: update.sensor,
      });

      // Fire offline alert only for real disconnects — not for sleep acknowledgements
      if (payload.status === 'offline' && !isSleepAck) {
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
      // ── Step 1: processing → mark dispensing ──────────────────────
      if (payload.status === 'processing') {
        await this.orderModel.updateOne(
          { orderId: payload.id },
          { $set: { status: 'dispensing' } },
        );
        this.logger.debug(`Order ${payload.id} → dispensing`);
        this.eventsGateway.emitOrderStatus({
          orderId: payload.id,
          status: 'dispensing',
        });
        return;
      }

      // ── Step 2: Find order ─────────────────────────────────────────
      const order = await this.orderModel
        .findOne({ orderId: payload.id })
        .exec();
      if (!order) {
        this.logger.warn(
          `Order status update received for unknown orderId: ${payload.id}`,
        );
        return;
      }

      // ── Step 3: Parse ord string → deduct inventory stock ──────────
      const machine = await this.machineModel
        .findOne({ machineId: order.machineId })
        .exec();
      const isFoodMachine = (machine as any)?.machineType === 'food';
      let totalDispensed = 0;

      if (
        payload.ord &&
        (payload.status === 'completed' || payload.status === 'cancelled')
      ) {
        if (machine) {
          const ordList = payload.ord.split(',').filter(Boolean);

          for (const ordStr of ordList) {
            const parts = ordStr.split('-');
            const nozzleNum = parseInt(parts[0].replace('N', ''), 10);

            // Format: N1-qty  OR  N1-name-qty-waterTimer-powderTimer
            const dispensedQty =
              parts.length === 2
                ? parseInt(parts[1], 10) || 0
                : parseInt(parts[2], 10) || 0;

            totalDispensed += dispensedQty;

            if (isNaN(nozzleNum) || dispensedQty === 0) continue;

            if (!isFoodMachine) {
              // Coffee machine: deduct grams from inventory
              const invItem = (machine as any).inventory?.find(
                (inv: any) => inv.nozzle === nozzleNum,
              );
              if (!invItem) continue;

              const gramsPerCup =
                invItem.gramsPerCup > 0 ? invItem.gramsPerCup : 18;
              const gramsConsumed = dispensedQty * gramsPerCup;
              const newStock = Math.max(
                0,
                invItem.currentStock - gramsConsumed,
              );
              const newCupcount = Math.floor(newStock / gramsPerCup);

              await this.machineModel.updateOne(
                { machineId: order.machineId, 'inventory.nozzle': nozzleNum },
                {
                  $inc: { 'inventory.$.currentStock': -gramsConsumed },
                  $set: { 'inventory.$.cupcount': newCupcount },
                },
              );

              this.logger.log(
                `[Order] Nozzle ${nozzleNum}: dispensed=${dispensedQty} grams=${gramsConsumed} ` +
                  `stock=${newStock}g cups_left=${newCupcount}`,
              );

              // Low stock alert check
              if (newStock <= invItem.minStock) {
                await this.alertsService.createLowStockAlert(
                  order.machineId,
                  invItem.itemId,
                  newStock,
                );
              }
            }
          }
        }
      }

      // ── Step 4: Determine final order status ───────────────────────
      const orderedQty = order.quantity ?? 1;
      let finalStatus: string;

      if (payload.status === 'completed') {
        finalStatus = 'completed';
      } else if (payload.status === 'cancelled') {
        if (totalDispensed === 0) {
          finalStatus = 'cancelled';
        } else if (totalDispensed < orderedQty) {
          finalStatus = 'half-completed';
        } else {
          finalStatus = 'completed'; // all dispensed despite cancel signal
        }
      } else {
        finalStatus = payload.status; // e.g. processing (already handled above)
      }

      // ── Step 5: Food machine — restore batch on cancellation ───────
      // Only restore units that were NOT physically dispensed. For half-completed
      // orders, totalDispensed units were already consumed by the machine.
      // Uses restoreBatchStock() so that depleted batches are re-activated when
      // the restored quantity brings them above 0.
      if (isFoodMachine && payload.status === 'cancelled') {
        const undelivered = (order.quantity ?? 1) - totalDispensed;
        if (undelivered > 0) {
          await this.restoreBatchStock(
            order.machineId,
            order.itemId,
            undelivered,
          );
          this.logger.log(
            `[Order] Food batch restored: +${undelivered} units for ${order.itemId} on ${order.machineId} (ordered=${order.quantity}, dispensed=${totalDispensed})`,
          );
        }
      }

      // ── Step 6: Persist final status + refund if needed ───────────
      if (finalStatus === 'completed') {
        order.status = 'completed';
        await order.save();
        this.logger.log(`[Order] ${payload.id} completed via MQTT`);
        this.eventsGateway.emitOrderStatus({
          orderId: payload.id,
          machineId: order.machineId,
          status: 'completed',
        });
      } else if (
        finalStatus === 'cancelled' ||
        finalStatus === 'half-completed'
      ) {
        order.status =
          finalStatus === 'half-completed' ? 'half-completed' : 'failed';
        order.failureReason =
          finalStatus === 'half-completed'
            ? `Partially dispensed: ${totalDispensed} of ${orderedQty}`
            : 'Machine cancelled the order';
        await order.save();

        if (order.status !== 'completed') {
          await this.walletService.refund(
            order.userId,
            order.totalAmount,
            order._id.toString(),
          );
          this.logger.log(
            `[Order] Refunded ${order.totalAmount} LKR → user ${order.userId} (${finalStatus})`,
          );
        }

        this.eventsGateway.emitOrderStatus({
          orderId: payload.id,
          machineId: order.machineId,
          status: order.status,
          failureReason: order.failureReason,
        });
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

    // Admin panel sends { flush_mode: true } via PATCH — intercept and send MQTT flush
    if ((dto as any).flush_mode === true) {
      const mid = (machine as any).machineId as string;
      try {
        const result = await this.triggerManualFlush(mid, 'daily');
        return {
          ...machine,
          _flushResult: result.message,
          _flushError: null,
        } as any;
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`Flush blocked for machine ${mid}: ${msg}`);
        return { ...machine, _flushResult: null, _flushError: msg } as any;
      }
    }

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
    const gramsPerCup =
      dto.gramsPerCup ??
      (idx >= 0 ? machine.inventory[idx].gramsPerCup : 18) ??
      18;
    const cupcount = Math.floor(dto.currentStock / (gramsPerCup || 18));

    if (idx >= 0) {
      machine.inventory[idx].currentStock = dto.currentStock;
      machine.inventory[idx].cupcount = cupcount;
      if (dto.minStock !== undefined)
        machine.inventory[idx].minStock = dto.minStock;
      if (dto.gramsPerCup !== undefined)
        machine.inventory[idx].gramsPerCup = dto.gramsPerCup;
    } else {
      machine.inventory.push({
        itemId: dto.itemId,
        currentStock: dto.currentStock,
        cupcount,
        minStock: dto.minStock ?? 5,
        nozzle: dto.nozzle ?? 1,
        gramsPerCup,
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
    // Support both MongoDB _id and machineId field
    const machine = await this.machineModel
      .findOne({
        $or: [
          { machineId },
          ...(machineId.length === 24 ? [{ _id: machineId }] : []),
        ],
      })
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);
    if ((machine as any).sleepMode === true) {
      throw new BadRequestException(
        'Cannot flush: machine is in sleep mode. Wake it first.',
      );
    }
    if (!(machine as any).isOnline) {
      throw new BadRequestException(
        'Cannot flush: machine is offline. Wait for it to come online first.',
      );
    }
    // Always use the machineId field for MQTT topic and DB queries
    const mid = (machine as any).machineId as string;

    // Mark flush mode active in DB (mirrors old backend flush tracking)
    await this.machineModel.updateOne(
      { machineId: mid },
      { $set: { flushMode: true } },
    );

    await this.mqttService.flush(mid);
    this.logger.log(`Manual flush triggered for machine ${mid} (${type})`);

    // Auto-reset flushMode after 30 seconds (old backend behaviour)
    setTimeout(async () => {
      await this.machineModel.updateOne(
        { machineId: mid },
        { $set: { flushMode: false } },
      );
      this.logger.log(`Flush completed for machine ${mid}`);
    }, 30_000);

    return { message: `Flush command sent to machine ${mid}` };
  }

  // Auto-flush daily at 2:00 AM Asia/Colombo
  @Cron('30 20 * * *', { timeZone: 'Asia/Colombo' })
  async dailyFlush(): Promise<void> {
    this.logger.log('Running daily flush for all active machines...');
    const machines = await this.machineModel
      .find({ status: 'active', machineType: 'coffee', isOnline: true })
      .select('machineId')
      .exec();
    const ids = machines.map((m) => m.machineId);
    if (ids.length === 0) {
      this.logger.log('Daily flush: no online coffee machines found');
      return;
    }
    this.mqttService.flushAll(ids);
    this.logger.log(
      `Daily flush sent to ${ids.length} machines: ${ids.join(', ')}`,
    );
  }

  // Auto-flush weekly every Sunday at 3:00 AM Asia/Colombo
  @Cron('0 21 * * 0', { timeZone: 'Asia/Colombo' })
  async weeklyFlush(): Promise<void> {
    this.logger.log('Running weekly flush for all active machines...');
    const machines = await this.machineModel
      .find({ status: 'active', machineType: 'coffee', isOnline: true })
      .select('machineId')
      .exec();
    const ids = machines.map((m) => m.machineId);
    if (ids.length === 0) {
      this.logger.log('Weekly flush: no online coffee machines found');
      return;
    }
    this.mqttService.flushAll(ids);
    this.logger.log(
      `Weekly flush sent to ${ids.length} machines: ${ids.join(', ')}`,
    );
  }

  /**
   * Auto-cancel orders stuck in pending/dispensing for more than 3 minutes.
   * Runs every minute. Refunds wallet and restores food-machine batch stock.
   */
  @Cron('* * * * *')
  async cancelTimedOutOrders(): Promise<void> {
    const cutoff = new Date(Date.now() - 3 * 60 * 1000);
    const stuckOrders = await this.orderModel
      .find({
        status: { $in: ['pending', 'dispensing'] },
        createdAt: { $lt: cutoff },
      })
      .exec();

    for (const order of stuckOrders) {
      order.status = 'failed';
      order.failureReason = 'Order timed out — machine did not confirm';
      await order.save();

      await this.walletService.refund(
        order.userId,
        order.totalAmount,
        order._id.toString(),
      );

      const machine = await this.machineModel
        .findOne({ machineId: order.machineId })
        .exec();
      if ((machine as any)?.machineType === 'food') {
        // Use restoreBatchStock so depleted batches are re-activated when
        // restored quantity brings them above 0.
        await this.restoreBatchStock(
          order.machineId,
          order.itemId,
          order.quantity,
        );
      }

      this.logger.warn(
        `[Timeout] Auto-cancelled order ${order.orderId} — refunded ${order.totalAmount} LKR to user ${order.userId}`,
      );
      this.eventsGateway.emitOrderStatus({
        orderId: order.orderId ?? order._id.toString(),
        status: 'failed',
        failureReason: 'timeout',
      });
    }
  }

  async deductStock(
    machineId: string,
    itemId: string,
    quantity: number,
  ): Promise<void> {
    // Resolve gramsPerCup so we deduct grams (not cups) from currentStock
    const machine = await this.machineModel.findOne({ machineId }).exec();
    const inv = (machine as any)?.inventory?.find(
      (i: any) => i.itemId === itemId,
    );
    const gramsPerCup = inv?.gramsPerCup > 0 ? inv.gramsPerCup : 18;
    const gramsToDeduct = quantity * gramsPerCup;
    const newStock = Math.max(0, (inv?.currentStock ?? 0) - gramsToDeduct);
    const newCupcount = Math.floor(newStock / gramsPerCup);

    // Atomic deduction — the $gte filter prevents negative stock under concurrent orders
    const updated = await this.machineModel
      .findOneAndUpdate(
        {
          machineId,
          'inventory.itemId': itemId,
          'inventory.currentStock': { $gte: gramsToDeduct },
        },
        {
          $inc: { 'inventory.$.currentStock': -gramsToDeduct },
          $set: { 'inventory.$.cupcount': newCupcount },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        `Insufficient stock for item ${itemId} on machine ${machineId}`,
      );
    }

    // Check if stock dropped to or below minStock and fire alert if so
    const updatedInv = updated.inventory.find((i) => i.itemId === itemId);
    if (updatedInv && updatedInv.currentStock <= updatedInv.minStock) {
      const alert = await this.alertsService.createLowStockAlert(
        machineId,
        itemId,
        updatedInv.currentStock,
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

  /**
   * Restore batch stock — used to roll back a deductBatchStock when an order fails
   * before MQTT confirmation (e.g. timer validation error, outer catch refund path),
   * or when the machine cancels/times-out after batch was pre-deducted.
   *
   * Two-step update:
   *   1. Increment quantity back
   *   2. Re-activate any depleted batch that now has qty > 0
   *      (deductBatchStock marks batches 'depleted' when qty hits 0; without this
   *       step the restored units would be permanently invisible to future orders
   *       because both the stock check and deductBatchStock only find 'active' batches)
   */
  async restoreBatchStock(
    machineId: string,
    itemId: string,
    quantity: number,
  ): Promise<void> {
    // Step 1: increment quantity
    await this.machineModel.updateOne(
      {
        machineId,
        'batches.itemId': itemId,
        'batches.status': { $in: ['active', 'depleted'] },
      },
      { $inc: { 'batches.$.quantity': quantity } },
    );
    // Step 2: re-activate any depleted batch that now has quantity > 0
    await this.machineModel.updateOne(
      {
        machineId,
        'batches.itemId': itemId,
        'batches.status': 'depleted',
        'batches.quantity': { $gt: 0 },
      },
      { $set: { 'batches.$.status': 'active' } },
    );
    this.logger.log(
      `[Batch] Restored +${quantity} units of ${itemId} on ${machineId} (order rollback)`,
    );
  }

  // ─── Sleep Mode ──────────────────────────────────────────────────────────────

  /**
   * Put a machine into sleep mode or wake it.
   * Sends MQTT command to machine/log/{machineId} matching old backend format.
   */
  async setSleepMode(id: string, sleep: boolean): Promise<Machine> {
    // id may be MongoDB _id (from admin panel) or machineId field — support both
    // When waking (sleep: false), clear the stale Sleep_Mode_ON error so the DB
    // reflects "waking" state rather than "sleeping" state until the machine sends
    // its first READY_STATE heartbeat.
    const setFields: Record<string, any> = { sleepMode: sleep };
    if (!sleep) setFields.error = null;

    const machine = await this.machineModel
      .findOneAndUpdate(
        {
          $or: [{ machineId: id }, ...(id.length === 24 ? [{ _id: id }] : [])],
        },
        { $set: setFields },
        { new: true },
      )
      .lean()
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);

    // Always use the machine's machineId field for the MQTT topic (e.g., "MCH-001")
    const mid = (machine as any).machineId as string;
    if (sleep) {
      this.mqttService.sleep(mid);
    } else {
      this.mqttService.wake(mid);
    }
    this.logger.log(`Machine ${mid} sleep mode → ${sleep}`);
    return machine;
  }

  /**
   * Mark machine online or offline (called from legacy admin panel route).
   * Supports both MongoDB _id and machineId field.
   */
  async setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await this.machineModel.updateOne(
      { $or: [{ machineId: id }, ...(id.length === 24 ? [{ _id: id }] : [])] },
      { $set: { isOnline } },
    );
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
   * Every 10 seconds — mirrors old backend timer.js offlineMachineWhenNotConnected().
   * If a machine has not sent an MQTT heartbeat in the last 10 seconds, mark it offline.
   */
  @Cron('*/10 * * * * *')
  async markOfflineSilentMachines(): Promise<void> {
    const cutoff = new Date(Date.now() - 10_000);
    // Exclude machines in sleep mode or flush mode — both stop heartbeats intentionally
    const result = await this.machineModel.updateMany(
      {
        isOnline: true,
        sleepMode: { $ne: true },
        flushMode: { $ne: true },
        lastSeen: { $lt: cutoff },
      },
      { $set: { isOnline: false, error: 'MACHINE_NOT_CONNECTED' } },
    );
    if (result.modifiedCount > 0) {
      this.logger.warn(
        `Marked ${result.modifiedCount} machine(s) offline (no MQTT heartbeat > 10s)`,
      );
    }
  }
}
