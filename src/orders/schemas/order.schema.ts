import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Order {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  machineId: string;

  @Prop({ type: String, required: true })
  itemId: string;

  @Prop({ type: String })
  itemName: string;

  @Prop({ type: String, required: true })
  cupSize: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity: number;

  @Prop({ type: Number, required: true })
  unitPrice: number;

  @Prop({ type: Number, required: true })
  totalAmount: number;

  @Prop({
    type: String,
    enum: ['pending', 'dispensing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({ type: String })
  transactionId: string;

  @Prop({ type: Boolean, default: false })
  isRated: boolean;

  @Prop({ type: String })
  failureReason?: string;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ userId: 1 });
OrderSchema.index({ machineId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
