import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type AlertDocument = HydratedDocument<Alert>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Alert {
  @Prop({ type: String, required: true })
  machineId: string;

  @Prop({ type: String })
  itemId?: string;

  @Prop({
    type: String,
    enum: ['low_stock', 'machine_offline', 'dispense_failure', 'maintenance_required', 'custom'],
    required: true,
  })
  type: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  severity: string;

  @Prop({ type: Boolean, default: false })
  isResolved: boolean;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date;

  @Prop({ type: String })
  resolvedBy?: string;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
AlertSchema.index({ machineId: 1 });
AlertSchema.index({ isResolved: 1 });
AlertSchema.index({ createdAt: -1 });
