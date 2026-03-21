import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Wallet {
  @Prop({ type: String, required: true, unique: true })
  userId: string;

  /** Public-facing wallet reference ID e.g. wlt_lz4abc12_x7r9kp2q */
  @Prop({ type: String, default: null })
  walletId?: string | null;

  @Prop({ type: Number, default: 0 })
  balance: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ userId: 1 }, { unique: true });
