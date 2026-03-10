import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Item, ItemDocument } from './schemas/item.schema';
import { Rating, RatingDocument } from './schemas/rating.schema';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

// Global Bayesian prior constants
const GLOBAL_MEAN = 3.5; // assumed global mean rating
const MIN_VOTES = 10;    // minimum votes needed for Bayesian weight

@Injectable()
export class ItemsService {
  constructor(
    @InjectModel(Item.name) private readonly itemModel: Model<ItemDocument>,
    @InjectModel(Rating.name) private readonly ratingModel: Model<RatingDocument>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const item = new this.itemModel(dto);
    return item.save();
  }

  async findAll(category?: string): Promise<Item[]> {
    const filter = category ? { category } : {};
    return this.itemModel.find(filter).sort({ bayesianRating: -1 }).exec();
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemModel.findById(id).exec();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  async update(id: string, dto: Partial<CreateItemDto>): Promise<Item> {
    const item = await this.itemModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  async remove(id: string): Promise<void> {
    const result = await this.itemModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Item ${id} not found`);
  }

  async addRating(userId: string, dto: CreateRatingDto): Promise<Rating> {
    // Prevent duplicate rating for same order+item
    const existing = await this.ratingModel.findOne({
      userId,
      itemId: dto.itemId,
      orderId: dto.orderId,
    });
    if (existing) throw new ConflictException('You have already rated this item for this order');

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
    const bayesianRating = (n * avg + MIN_VOTES * GLOBAL_MEAN) / (n + MIN_VOTES);

    await this.itemModel.findByIdAndUpdate(itemId, {
      totalRating,
      ratingCount: n,
      bayesianRating: Math.round(bayesianRating * 100) / 100,
    });
  }
}
