import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type AdvertisementDocument = HydratedDocument<Advertisement>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Advertisement {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  imageUrl?: string;

  @Prop({ type: String })
  videoUrl?: string;

  @Prop({ type: String })
  targetUrl?: string;

  @Prop({
    type: String,
    enum: ['all', 'specific_machines', 'specific_clients'],
    default: 'all',
  })
  targetType: string;

  @Prop({ type: [String], default: [] })
  targetIds: string[];

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Number, default: 0 })
  viewCount: number;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const AdvertisementSchema = SchemaFactory.createForClass(Advertisement);
AdvertisementSchema.index({ isActive: 1 });
AdvertisementSchema.index({ startDate: 1, endDate: 1 });
