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

  @Prop({ type: String, default: null })
  orgId: string;

  @Prop({ type: String })
  agentId: string;

  // coffee = original espresso/powder machine, food = food vending machine
  @Prop({ type: String, enum: ['coffee', 'food'], default: 'coffee' })
  machineType: string;

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

  // ─── Inventory / Stock ────────────────────────────────────────────────────────
  @Prop({
    type: [
      {
        itemId: { type: String },
        currentStock: { type: Number, default: 0 }, // grams remaining
        cupcount: { type: Number, default: 0 }, // calculated: floor(currentStock / gramsPerCup)
        minStock: { type: Number, default: 5 },
        nozzle: { type: Number, default: 1 },
        gramsPerCup: { type: Number, default: 18 },
      },
    ],
    default: [],
  })
  inventory: {
    itemId: string;
    currentStock: number;
    cupcount: number;
    minStock: number;
    nozzle: number;
    gramsPerCup: number;
  }[];

  // ─── Calibration timers ───────────────────────────────────────────────────────
  @Prop({
    type: [
      {
        itemId: { type: String },
        nozzle: { type: Number, default: 1 },
        timerOfPowder: { type: Number }, // ms — powder dispense time
        timerOfWater: { type: Number }, // ms — water dispense time
        cupSize: { type: String },
        volMl: { type: Number }, // volume in ml
        volGram: { type: Number }, // grams for this size
      },
    ],
    default: [],
  })
  calibration: {
    itemId: string;
    nozzle: number;
    timerOfPowder: number;
    timerOfWater: number;
    cupSize: string;
    volMl: number;
    volGram: number;
  }[];

  // ─── Sensor data (updated from machine/status/update MQTT) ───────────────────
  @Prop({
    type: {
      temp: { type: Number, default: null },
      water: { type: String, default: null }, // 'full' | 'low' | 'empty'
      powderlevel: {
        type: [
          {
            canister: { type: Number },
            level: { type: Number }, // percent 0-100
          },
        ],
        default: [],
      },
    },
    default: {},
  })
  sensor: {
    temp?: number;
    water?: string;
    powderlevel?: { canister: number; level: number }[];
  };

  // ─── Food vending — batch/stock management ────────────────────────────────────
  @Prop({
    type: [
      {
        batchId: { type: String },
        itemId: { type: String },
        itemName: { type: String },
        nozzleId: { type: Number },
        quantity: { type: Number }, // remaining units
        totalQty: { type: Number }, // loaded units
        expiryDate: { type: Date },
        loadedAt: { type: Date, default: Date.now },
        loadedBy: { type: String }, // agentId
        status: {
          type: String,
          enum: ['active', 'expired', 'depleted'],
          default: 'active',
        },
      },
    ],
    default: [],
  })
  batches: {
    batchId: string;
    itemId: string;
    itemName: string;
    nozzleId: number;
    quantity: number;
    totalQty: number;
    expiryDate: Date;
    loadedAt: Date;
    loadedBy: string;
    status: string;
  }[];

  // ─── Food vending — temperature threshold ─────────────────────────────────────
  @Prop({ type: Number, default: null })
  temperatureThreshold: number;

  // Explicit item assignment: items admin has assigned to this machine
  // Mobile app shows these even before inventory is loaded (with out-of-stock badge)
  @Prop({ type: [String], default: [] })
  itemIds: string[];

  @Prop({ type: Boolean, default: false })
  sleepMode: boolean;

  @Prop({ type: Boolean, default: false })
  flushMode: boolean;

  @Prop({ type: Boolean, default: false })
  autoFlushEnabled: boolean;

  @Prop({ type: String, default: null })
  mqttTopic: string;

  @Prop({ type: String, default: null })
  error: string; // 'READY_STATE' or error code from machine

  @Prop({ default: now })
  createdAt: Date;

  @Prop({ default: now })
  updatedAt: Date;
}

export const MachineSchema = SchemaFactory.createForClass(Machine);
MachineSchema.index({ clientId: 1 });
MachineSchema.index({ orgId: 1 });
MachineSchema.index({ agentId: 1 });
MachineSchema.index({ machineId: 1 }, { unique: true });
MachineSchema.index({ machineType: 1 });
