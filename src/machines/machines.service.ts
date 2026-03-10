import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Machine, MachineDocument } from './schemas/machine.schema';
import { MqttService } from '../mqtt/mqtt.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto, UpdateInventoryDto, UpdateCalibrationDto } from './dto/update-machine.dto';

@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);

  constructor(
    @InjectModel(Machine.name) private readonly machineModel: Model<MachineDocument>,
    private readonly mqttService: MqttService,
  ) {}

  async create(dto: CreateMachineDto): Promise<Machine> {
    const machine = new this.machineModel(dto);
    return machine.save();
  }

  async findAll(clientId?: string, agentId?: string): Promise<Machine[]> {
    const filter: Record<string, string> = {};
    if (clientId) filter.clientId = clientId;
    if (agentId) filter.agentId = agentId;
    return this.machineModel.find(filter).exec();
  }

  async findOne(id: string): Promise<Machine> {
    const machine = await this.machineModel.findById(id).exec();
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async findByMachineId(machineId: string): Promise<Machine> {
    const machine = await this.machineModel.findOne({ machineId }).exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);
    return machine;
  }

  async update(id: string, dto: UpdateMachineDto): Promise<Machine> {
    const machine = await this.machineModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!machine) throw new NotFoundException(`Machine ${id} not found`);
    return machine;
  }

  async remove(id: string): Promise<void> {
    const result = await this.machineModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Machine ${id} not found`);
  }

  async updateInventory(machineId: string, dto: UpdateInventoryDto): Promise<Machine> {
    const machine = await this.machineModel.findOne({ machineId }).exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);

    const idx = machine.inventory.findIndex((i) => i.itemId === dto.itemId);
    if (idx >= 0) {
      machine.inventory[idx].currentStock = dto.currentStock;
      if (dto.minStock !== undefined) machine.inventory[idx].minStock = dto.minStock;
    } else {
      machine.inventory.push({
        itemId: dto.itemId,
        currentStock: dto.currentStock,
        minStock: dto.minStock ?? 5,
      });
    }
    return machine.save();
  }

  async updateCalibration(machineId: string, dto: UpdateCalibrationDto): Promise<Machine> {
    const machine = await this.machineModel.findOne({ machineId }).exec();
    if (!machine) throw new NotFoundException(`Machine ${machineId} not found`);

    const idx = machine.calibration.findIndex(
      (c) => c.itemId === dto.itemId && c.cupSize === dto.cupSize,
    );
    if (idx >= 0) {
      machine.calibration[idx] = { ...machine.calibration[idx], ...dto };
    } else {
      machine.calibration.push(dto);
    }

    // Send calibration to machine via MQTT
    this.mqttService.calibrate(machineId, dto);
    return machine.save();
  }

  async triggerManualFlush(machineId: string, type: 'daily' | 'weekly'): Promise<{ message: string }> {
    await this.findByMachineId(machineId);
    this.mqttService.flush(machineId, type);
    this.logger.log(`Manual flush triggered for machine ${machineId} (${type})`);
    return { message: `Flush command sent to machine ${machineId}` };
  }

  // Auto-flush daily at 2:00 AM Asia/Colombo (UTC+5:30 → UTC 20:30 previous day)
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

  async deductStock(machineId: string, itemId: string, quantity: number): Promise<void> {
    await this.machineModel.updateOne(
      { machineId, 'inventory.itemId': itemId },
      { $inc: { 'inventory.$.currentStock': -quantity } },
    );
  }

  async incrementOrderStats(machineId: string, amount: number): Promise<void> {
    await this.machineModel.updateOne(
      { machineId },
      { $inc: { totalOrders: 1, totalRevenue: amount } },
    );
  }
}
