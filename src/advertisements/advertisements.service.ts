import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Advertisement, AdvertisementDocument } from './schemas/advertisement.schema';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';

@Injectable()
export class AdvertisementsService {
  constructor(
    @InjectModel(Advertisement.name)
    private readonly adModel: Model<AdvertisementDocument>,
  ) {}

  async create(dto: CreateAdvertisementDto): Promise<Advertisement> {
    return new this.adModel(dto).save();
  }

  async findAll(activeOnly = false): Promise<Advertisement[]> {
    const now = new Date();
    const filter: Record<string, unknown> = {};
    if (activeOnly) {
      filter.isActive = true;
      filter.$or = [
        { startDate: null },
        { startDate: { $lte: now } },
      ];
      filter.$and = [
        {
          $or: [{ endDate: null }, { endDate: { $gte: now } }],
        },
      ];
    }
    return this.adModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findActive(machineId?: string): Promise<Advertisement[]> {
    const now = new Date();
    const filter: Record<string, unknown> = {
      isActive: true,
      $or: [{ startDate: null }, { startDate: { $lte: now } }],
    };
    const result = await this.adModel.find(filter).exec();
    return result.filter((ad) => {
      if (ad.endDate && new Date(ad.endDate) < now) return false;
      if (ad.targetType === 'all') return true;
      if (ad.targetType === 'specific_machines' && machineId) {
        return ad.targetIds.includes(machineId);
      }
      return true;
    });
  }

  async findOne(id: string): Promise<Advertisement> {
    const ad = await this.adModel.findById(id).exec();
    if (!ad) throw new NotFoundException(`Advertisement ${id} not found`);
    return ad;
  }

  async update(id: string, dto: Partial<CreateAdvertisementDto>): Promise<Advertisement> {
    const ad = await this.adModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!ad) throw new NotFoundException(`Advertisement ${id} not found`);
    return ad;
  }

  async remove(id: string): Promise<void> {
    const result = await this.adModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Advertisement ${id} not found`);
  }

  async incrementView(id: string): Promise<void> {
    await this.adModel.updateOne({ _id: id }, { $inc: { viewCount: 1 } }).exec();
  }
}
