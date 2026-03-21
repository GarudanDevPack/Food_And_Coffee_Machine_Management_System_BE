import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PromotionDocument = HydratedDocument<Promotion>;

@Schema({ timestamps: true })
export class Promotion {
  /** Display name shown in mobile app */
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, default: null })
  description?: string;

  /**
   * Item this promotion applies to.
   * null = applies to ALL items globally.
   */
  @Prop({ type: String, default: null, index: true })
  itemId?: string | null;

  /** Discount percentage (1–100) */
  @Prop({ type: Number, required: true, min: 1, max: 100 })
  discountPct: number;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  /** false = soft-deleted; filtered out from all active queries */
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);
PromotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
