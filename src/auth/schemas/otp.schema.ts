import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

@Schema({ timestamps: true })
export class Otp {
  /** Phone number in normalized +94XXXXXXXXX format */
  @Prop({ type: String, required: true, index: true })
  phone: string;

  /** 6-digit OTP code */
  @Prop({ type: String, required: true })
  code: string;

  /** Expiry timestamp — OTP is invalid after this */
  @Prop({ type: Date, required: true })
  expiresAt: Date;

  /** Marked true after a successful verify — prevents reuse */
  @Prop({ type: Boolean, default: false })
  used: boolean;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

/** TTL index — MongoDB auto-deletes expired OTP documents */
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
