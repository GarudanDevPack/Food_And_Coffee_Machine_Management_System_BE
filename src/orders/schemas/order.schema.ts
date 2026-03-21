import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Order {
  /** Human-readable order reference e.g. ETR-20260313_143052 (used in MQTT ack) */
  @Prop({ type: String })
  orderId?: string;

  @Prop({ type: String, required: true })
  userId: string;

  /** Agent who placed this order on behalf of the customer (null if self-ordered) */
  @Prop({ type: String, default: null })
  agentId?: string | null;

  @Prop({ type: String, required: true })
  machineId: string;

  @Prop({ type: String, required: true })
  itemId: string;

  @Prop({ type: String })
  itemName: string;

  @Prop({ type: String, default: null })
  cupSize?: string | null;

  @Prop({ type: Number, required: true, min: 1 })
  quantity: number;

  @Prop({ type: Number, required: true })
  unitPrice: number;

  @Prop({ type: Number, required: true })
  totalAmount: number;

  @Prop({ type: String, default: 'LKR' })
  currency: string;

  /** Original price before membership discount was applied */
  @Prop({ type: Number, default: null })
  originalAmount?: number | null;

  /** Membership discount % applied (15 | 20 | 25); null if no discount */
  @Prop({ type: Number, default: null })
  discountApplied?: number | null;

  @Prop({
    type: String,
    enum: [
      'pending',
      'dispensing',
      'completed',
      'failed',
      'refunded',
      'cancelled',
    ],
    default: 'pending',
  })
  status: string;

  @Prop({ type: String })
  transactionId: string;

  /** Promotion _id applied to this order (null if no promotion) */
  @Prop({ type: String, default: null })
  promotionId?: string | null;

  /** Promotion discount % applied (best-discount-wins vs membership) */
  @Prop({ type: Number, default: null })
  promotionDiscount?: number | null;

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
OrderSchema.index({ orderId: 1 }, { sparse: true });
