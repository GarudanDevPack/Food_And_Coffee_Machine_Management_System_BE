import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TopupRequestDocument = HydratedDocument<TopupRequest>;

/**
 * TopupRequest — bank slip top-up approval record.
 *
 * Flow:
 *   1. Customer submits amount + paymentSlipUrl → status = 'pending'
 *   2. Admin reviews the slip image and approves or rejects
 *   3. On approval → wallet balance is credited and transactionId is recorded
 *   4. On rejection → reviewNote explains the reason
 */
@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class TopupRequest {
  /** MongoDB _id of the customer who submitted this request */
  @Prop({ type: String, required: true, index: true })
  userId: string;

  /** Amount requested in LKR (must be > 0) */
  @Prop({ type: Number, required: true })
  amount: number;

  /** URL of the uploaded bank slip image (S3 or local file path) */
  @Prop({ type: String, required: true })
  paymentSlipUrl: string;

  /** Optional note from the customer (e.g. bank reference number) */
  @Prop({ type: String, default: null })
  note?: string;

  /** Current status of the request */
  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  })
  status: 'pending' | 'approved' | 'rejected';

  /** MongoDB _id of the admin who reviewed this request (set on approve/reject) */
  @Prop({ type: String, default: null })
  reviewedBy?: string;

  /** Admin note — required on rejection, optional on approval */
  @Prop({ type: String, default: null })
  reviewNote?: string;

  /** Transaction _id created when wallet was credited (set on approve only) */
  @Prop({ type: String, default: null })
  transactionId?: string;
}

export const TopupRequestSchema = SchemaFactory.createForClass(TopupRequest);

// Compound index for admin queue queries: filter by status + sort by createdAt
TopupRequestSchema.index({ status: 1, createdAt: -1 });
// Index for customer's own history
TopupRequestSchema.index({ userId: 1, createdAt: -1 });
