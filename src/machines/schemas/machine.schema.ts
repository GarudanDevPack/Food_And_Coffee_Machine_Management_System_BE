import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, now } from 'mongoose';

export type MachineDocument = HydratedDocument<Machine>;

@Schema({ timestamps: true, toJSON: { virtuals: true, getters: true } })
export class Machine {
  @Prop({ type: String, required: true, unique: true })
  machineId: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String })
  location: string;

  @Prop({ type: String })
  clientId: string;

  @Prop({ type: String })
  agentId: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
  })
  status: string;

  @Prop({ type: Boolean, default: false })
  isOnline: boolean;

  @Prop({ type: Date, default: null })
  lastSeen: Date;

  @Prop({ type: Number, default: 0 })
  totalOrders: number;

  @Prop({ type: Number, default: 0 })
  totalRevenue: number;

  // Stock / inventory — array of { itemId, currentStock, minStock }
  @Prop({
    type: [
      {
        itemId: { type: String },
        currentStock: { type: Number, default: 0 },
        minStock: { type: Number, default: 5 },
      },
    ],
    default: [],
  })
  inventory: { itemId: string; currentStock: number; minStock: number }[];

  // Calibration timers
  @Prop({
    type: [
      {
        itemId: { type: String },
        timerOfPowder: { type: Number },
        timerOfWater: { type: Number },
        cupSize: { type: String },
      },
    ],
    default: [],
  })
  calibration: {
    itemId: string;
    timerOfPowder: number;
    timerOfWater: number;
    cupSize: string;
  }[];

  @Prop({ type: Boolean, default: false })
  autoFlushEnabled: boolean;

  @Prop({ type: String, default: null })
  mqttTopic: string;

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const MachineSchema = SchemaFactory.createForClass(Machine);
MachineSchema.index({ clientId: 1 });
MachineSchema.index({ agentId: 1 });
MachineSchema.index({ machineId: 1 }, { unique: true });
