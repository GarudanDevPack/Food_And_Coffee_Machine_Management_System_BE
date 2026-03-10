import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Wallet {
  @Prop({ type: String, required: true, unique: true })
  userId: string;

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
