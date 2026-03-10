import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Alert, AlertDocument } from './schemas/alert.schema';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name) private readonly alertModel: Model<AlertDocument>,
  ) {}

  async create(dto: CreateAlertDto): Promise<Alert> {
    return new this.alertModel(dto).save();
  }

  async createLowStockAlert(machineId: string, itemId: string, currentStock: number): Promise<Alert> {
    return this.create({
      machineId,
      itemId,
      type: 'low_stock',
      message: `Stock level critically low (${currentStock} units remaining) for item ${itemId} on machine ${machineId}`,
      severity: currentStock === 0 ? 'critical' : 'high',
    });
  }

  async findAll(machineId?: string, resolved?: string): Promise<Alert[]> {
    const filter: Record<string, unknown> = {};
    if (machineId) filter.machineId = machineId;
    if (resolved !== undefined) filter.isResolved = resolved === 'true';
    return this.alertModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Alert> {
    const alert = await this.alertModel.findById(id).exec();
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    return alert;
  }

  async resolve(id: string, resolvedBy: string): Promise<Alert> {
    const alert = await this.alertModel
      .findByIdAndUpdate(
        id,
        { isResolved: true, resolvedAt: new Date(), resolvedBy },
        { new: true },
      )
      .exec();
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    return alert;
  }

  async remove(id: string): Promise<void> {
    const result = await this.alertModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Alert ${id} not found`);
  }

  async getUnresolvedCount(machineId?: string): Promise<number> {
    const filter: Record<string, unknown> = { isResolved: false };
    if (machineId) filter.machineId = machineId;
    return this.alertModel.countDocuments(filter).exec();
  }
}
