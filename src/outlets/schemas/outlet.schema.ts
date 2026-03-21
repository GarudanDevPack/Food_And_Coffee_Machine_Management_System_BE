import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OutletDocument = HydratedDocument<Outlet>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Outlet {
  /** Human-readable outlet ID, e.g. OUTLET_001 */
  @Prop({ type: String, required: true, unique: true })
  outletId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  location?: string;

  /** Agent (user id) who owns/manages this outlet */
  @Prop({ type: String, required: true })
  agentId: string;

  /** Client (user id) that this outlet belongs to */
  @Prop({ type: String })
  clientId?: string;

  /**
   * machineIds — references Machine.machineId (string unique key),
   * not MongoDB _id, to stay consistent with existing machine references.
   */
  @Prop({ type: [String], default: [] })
  machineIds: string[];

  /**
   * Unique random token embedded in the QR code.
   * Customers scan → hit GET /outlets/scan/:qrToken → see items.
   */
  @Prop({ type: String, required: true, unique: true })
  qrToken: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const OutletSchema = SchemaFactory.createForClass(Outlet);
OutletSchema.index({ agentId: 1 });
OutletSchema.index({ clientId: 1 });
OutletSchema.index({ qrToken: 1 }, { unique: true });
