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

  // Cup sizes with prices
  @Prop({
    type: [
      {
        size: { type: String, required: true },  // small, medium, large
        price: { type: Number, required: true },
        timerOfPowder: { type: Number, default: 0 },
        timerOfWater: { type: Number, default: 0 },
      },
    ],
    default: [],
  })
  cupSizes: { size: string; price: number; timerOfPowder: number; timerOfWater: number }[];

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
