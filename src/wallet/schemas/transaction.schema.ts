import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Transaction {
  @Prop({ type: String, required: true })
  walletId: string;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  })
  type: string;

  @Prop({
    type: String,
    enum: ['topup_qr', 'topup_bank', 'order_payment', 'refund', 'adjustment'],
    required: true,
  })
  category: string;

  @Prop({ type: String })
  referenceId?: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: Number })
  balanceBefore: number;

  @Prop({ type: Number })
  balanceAfter: number;

  @Prop({
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed',
  })
  status: string;

  @Prop({ type: String })
  paymentSlipUrl?: string;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ walletId: 1 });
TransactionSchema.index({ createdAt: -1 });
