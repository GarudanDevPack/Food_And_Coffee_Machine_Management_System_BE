import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type OrganizationDocument = HydratedDocument<Organization>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Organization {
  /** Auto-generated human-readable ID e.g. ORG-001 */
  @Prop({ type: String, required: true, unique: true })
  orgId: string;

  /** Display name of the merchant/franchise */
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: null })
  address?: string | null;

  @Prop({ type: String, default: null })
  phone?: string | null;

  @Prop({ type: String, default: null })
  email?: string | null;

  @Prop({ type: String, default: null })
  logoUrl?: string | null;

  /** MongoDB _id of the client user (role=3) who owns this organization */
  @Prop({ type: String, required: true, unique: true })
  clientUserId: string;

  /** MongoDB _ids of agent users assigned to this organization */
  @Prop({ type: [String], default: [] })
  agentIds: string[];

  /** Machine.machineId strings (e.g. "MCH-001") assigned to this organization */
  @Prop({ type: [String], default: [] })
  machineIds: string[];

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, required: true })
  contractStart: Date;

  @Prop({ type: Date, default: null })
  contractEnd?: Date | null;

  @Prop({ type: String, default: null })
  notes?: string | null;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ orgId: 1 }, { unique: true });
OrganizationSchema.index({ clientUserId: 1 }, { unique: true });
OrganizationSchema.index({ isActive: 1 });
