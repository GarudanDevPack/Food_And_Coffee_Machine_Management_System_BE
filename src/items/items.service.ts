import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Item, ItemDocument } from './schemas/item.schema';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

// Global Bayesian prior constants
const GLOBAL_MEAN = 3.5; // assumed global mean rating
const MIN_VOTES = 10; // minimum votes needed for Bayesian weight

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Rating.name)
    private readonly ratingModel: Model<RatingDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const item = new this.itemModel(dto);
    return item.save();
  }

  async findAll(
    category?: string,
    itemType?: string,
    orgId?: string,
    clientId?: string,
  ): Promise<Item[]> {
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (itemType) filter.itemType = itemType;
    if (orgId) filter.orgId = orgId;
    if (clientId) filter.clientId = clientId;
    return this.itemModel
      .find(filter)
      .sort({ bayesianRating: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemModel.findById(id).lean().exec();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  async update(id: string, dto: Partial<CreateItemDto>): Promise<Item> {
    const item = await this.itemModel
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  // Soft delete — sets isAvailable=false so order history referential integrity is preserved
  async remove(id: string): Promise<void> {
    const item = await this.itemModel
      .findByIdAndUpdate(id, { $set: { isAvailable: false } }, { new: true })
      .exec();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
  }

  async addRating(userId: string, dto: CreateRatingDto): Promise<Rating> {
    // Validate the order exists, belongs to this user, is for this item, and is completed
    const order = await this.orderModel.findById(dto.orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId)
      throw new ForbiddenException('This is not your order');
    if (order.itemId !== dto.itemId)
      throw new BadRequestException('Order item mismatch');
    if (order.status !== 'completed')
      throw new BadRequestException('Can only rate completed orders');

    // Prevent duplicate rating for same order+item
    const existing = await this.ratingModel.findOne({
      userId,
      itemId: dto.itemId,
      orderId: dto.orderId,
    });
    if (existing)
      throw new ConflictException(
        'You have already rated this item for this order',
      );

    const rating = await new this.ratingModel({ ...dto, userId }).save();

    // Recalculate Bayesian rating
    await this.recalculateBayesianRating(dto.itemId);

    return rating;
  }

  async getRatings(itemId: string): Promise<Rating[]> {
    return this.ratingModel.find({ itemId }).sort({ createdAt: -1 }).exec();
  }

  private async recalculateBayesianRating(itemId: string): Promise<void> {
    const ratings = await this.ratingModel.find({ itemId }).exec();
    const n = ratings.length;
    const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
    const avg = n > 0 ? totalRating / n : 0;

    // Bayesian formula: (n * avg + MIN_VOTES * GLOBAL_MEAN) / (n + MIN_VOTES)
    const bayesianRating =
      (n * avg + MIN_VOTES * GLOBAL_MEAN) / (n + MIN_VOTES);

    await this.itemModel.findByIdAndUpdate(itemId, {
      totalRating,
      ratingCount: n,
      bayesianRating: Math.round(bayesianRating * 100) / 100,
    });
  }
}
