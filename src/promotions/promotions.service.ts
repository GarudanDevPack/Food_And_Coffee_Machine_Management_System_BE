import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Promotion, PromotionDocument } from './schemas/promotion.schema';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectModel(Promotion.name)
    private readonly promotionModel: Model<PromotionDocument>,
  ) {}

  async create(dto: CreatePromotionDto): Promise<Promotion> {
    return new this.promotionModel(dto).save();
  }

  async findAll(active?: string): Promise<Promotion[]> {
    const filter: Record<string, unknown> = {};
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;
    return this.promotionModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /** Currently live promotions — startDate ≤ now ≤ endDate AND isActive=true */
  async findActive(): Promise<Promotion[]> {
    const now = new Date();
    return this.promotionModel
      .find({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .sort({ discountPct: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Promotion> {
    const promo = await this.promotionModel.findById(id).exec();
    if (!promo) throw new NotFoundException(`Promotion ${id} not found`);
    return promo;
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<Promotion> {
    const promo = await this.promotionModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!promo) throw new NotFoundException(`Promotion ${id} not found`);
    return promo;
  }

  /** Soft delete — sets isActive=false */
  async remove(id: string): Promise<void> {
    const promo = await this.promotionModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .exec();
    if (!promo) throw new NotFoundException(`Promotion ${id} not found`);
  }

  /**
   * Used by OrdersService at checkout.
   * Returns the best (highest discountPct) active promotion that matches:
   *   - this specific itemId, OR a global promotion (itemId = null)
   */
  async findBestPromotion(itemId: string): Promise<Promotion | null> {
    const now = new Date();
    return this.promotionModel
      .findOne({
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [{ itemId }, { itemId: null }],
      })
      .sort({ discountPct: -1 })
      .exec();
  }
}
