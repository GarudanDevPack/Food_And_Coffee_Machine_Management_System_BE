import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type ItemDocument = HydratedDocument<Item>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Item {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  category?: string;

  @Prop({ type: String })
  imageUrl?: string;

  // 'coffee' uses cupSizes[]; 'food' uses unitPrice
  @Prop({
    type: String,
    enum: ['coffee', 'food'],
    default: 'coffee',
    required: true,
  })
  itemType: 'coffee' | 'food';

  // Food items: single flat price per unit
  @Prop({ type: Number, default: null })
  unitPrice?: number;

  // Scope item to a specific client user (_id). null = global item visible to all.
  @Prop({ type: String, default: null })
  clientId?: string;

  // Scope item to a specific organization (_id). null = global.
  @Prop({ type: String, default: null })
  orgId?: string;

  // Cup sizes with prices (coffee only)
  @Prop({
    type: [
      {
        size: { type: String, required: true },
        price: { type: Number, required: true },
        timerOfPowder: { type: Number, default: 0 },
        timerOfWater: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  cupSizes: {
    size: string;
    price: number;
    timerOfPowder: number;
    timerOfWater: number;
  }[];

  // Bayesian rating fields
  @Prop({ type: Number, default: 0 })
  totalRating: number;

  @Prop({ type: Number, default: 0 })
  ratingCount: number;

  @Prop({ type: Number, default: 0 })
  bayesianRating: number;

  @Prop({ type: Boolean, default: true })
  isAvailable: boolean;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const ItemSchema = SchemaFactory.createForClass(Item);
ItemSchema.index({ category: 1 });
ItemSchema.index({ bayesianRating: -1 });
ItemSchema.index({ itemType: 1 });
ItemSchema.index({ clientId: 1 });
ItemSchema.index({ orgId: 1 });
