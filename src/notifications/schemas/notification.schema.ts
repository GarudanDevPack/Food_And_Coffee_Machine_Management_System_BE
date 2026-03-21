import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Notification {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({
    type: String,
    enum: ['order', 'wallet', 'alert', 'promotion', 'system'],
    default: 'system',
  })
  type: string;

  @Prop({ type: String })
  referenceId?: string;

  @Prop({ type: Boolean, default: false })
  isRead: boolean;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });
