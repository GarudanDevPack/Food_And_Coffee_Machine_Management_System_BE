import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly walletService: WalletService,
    private readonly machinesService: MachinesService,
    private readonly itemsService: ItemsService,
    private readonly mqttService: MqttService,
  ) {}

  async placeOrder(userId: string, dto: CreateOrderDto): Promise<Order> {
    // 1. Verify item exists and get price for cup size
    const item = await this.itemsService.findOne(dto.itemId);
    const cupSizeConfig = item.cupSizes.find((cs) => cs.size === dto.cupSize);
    if (!cupSizeConfig) {
      throw new BadRequestException(`Cup size "${dto.cupSize}" not available for this item`);
    }

    const totalAmount = cupSizeConfig.price * dto.quantity;

    // 2. Create order record (pending)
    const order = await new this.orderModel({
      userId,
      machineId: dto.machineId,
      itemId: dto.itemId,
      itemName: item.name,
      cupSize: dto.cupSize,
      quantity: dto.quantity,
      unitPrice: cupSizeConfig.price,
      totalAmount,
      status: 'pending',
    }).save();

    try {
      // 3. Deduct from wallet
      const tx = await this.walletService.deduct(
        userId,
        totalAmount,
        order.id,
        `Order: ${item.name} (${dto.cupSize} x${dto.quantity})`,
      );

      // 4. Update order with transaction ID and mark as dispensing
      order.transactionId = tx.id;
      order.status = 'dispensing';
      await order.save();

      // 5. Send MQTT dispense command
      this.mqttService.dispense(dto.machineId, dto.itemId, dto.cupSize, dto.quantity);

      // 6. Deduct machine stock
      await this.machinesService.deductStock(dto.machineId, dto.itemId, dto.quantity);

      // 7. Update machine stats
      await this.machinesService.incrementOrderStats(dto.machineId, totalAmount);

      this.logger.log(`Order ${order.id} placed — ${item.name} x${dto.quantity} on machine ${dto.machineId}`);
      return order;
    } catch (err) {
      // Rollback: mark as failed
      order.status = 'failed';
      order.failureReason = err.message;
      await order.save();
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
    return order.save();
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

    // Refund wallet if money was already deducted
    if (order.status === 'dispensing') {
      await this.walletService.refund(order.userId, order.totalAmount, orderId);
    }

    order.status = 'failed';
    order.failureReason = reason;
    return order.save();
  }

  /**
   * Ensures the caller has access to the machine this order was placed on.
   * Admins/SuperAdmins bypass the check.
   * Agents must be assigned to the machine (machine.agentId === callerId).
   */
  private async assertMachineAccess(
    machineId: string,
    callerId: string,
    callerRole: RoleEnum,
  ): Promise<void> {
    if (
      callerRole === RoleEnum.super_admin ||
      callerRole === RoleEnum.admin
    ) {
      return; // admins can update any order
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

  async findAll(userId?: string, machineId?: string, status?: string): Promise<Order[]> {
    const filter: Record<string, string> = {};
    if (userId) filter.userId = userId;
    if (machineId) filter.machineId = machineId;
    if (status) filter.status = status;
    return this.orderModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findMyOrders(userId: string): Promise<Order[]> {
    return this.orderModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }
}
