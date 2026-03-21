import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type RatingDocument = HydratedDocument<Rating>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Rating {
  @Prop({ type: String, required: true })
  itemId: string;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  orderId: string;

  @Prop({ type: Number, required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: String })
  comment?: string;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);
RatingSchema.index({ itemId: 1 });
RatingSchema.index({ userId: 1, itemId: 1, orderId: 1 }, { unique: true });
