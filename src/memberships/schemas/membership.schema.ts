import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type MembershipDocument = HydratedDocument<Membership>;

export type MembershipPlan = '1month' | '3month' | '5month';

/** Discount percentage per plan */
export const PLAN_DISCOUNT: Record<string, number> = {
  '1month': 15,
  '3month': 20,
  '5month': 25,
};

/** Subscription price in LKR per plan */
export const PLAN_PRICE: Record<string, number> = {
  '1month': 500,
  '3month': 1300,
  '5month': 2000,
};

/** Duration in days per plan */
export const PLAN_DAYS: Record<string, number> = {
  '1month': 30,
  '3month': 90,
  '5month': 150,
};

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Membership {
  /** Customer who owns this membership */
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, enum: ['1month', '3month', '5month'], required: true })
  plan: string;

  /** Derived discount percentage (15 | 20 | 25) */
  @Prop({ type: Number, required: true })
  discount: number;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active',
  })
  status: string;

  /** Amount paid (LKR) deducted from wallet at subscription time */
  @Prop({ type: Number, required: true })
  pricePaid: number;

  /** Wallet debit transaction ID for this subscription */
  @Prop({ type: String })
  transactionId?: string;

  /** Agent who sold this subscription on behalf of the customer (null if self-subscribed) */
  @Prop({ type: String, default: null })
  createdByAgentId?: string | null;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.index({ userId: 1 });
MembershipSchema.index({ status: 1 });
MembershipSchema.index({ endDate: 1 });
