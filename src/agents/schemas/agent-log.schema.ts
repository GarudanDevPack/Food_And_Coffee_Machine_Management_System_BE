import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentLogDocument = AgentLog & Document;

export type AgentLogAction =
  | 'customer_created'
  | 'membership_sold'
  | 'wallet_topup'
  | 'inspection_filed'
  | 'order_completed'
  | 'order_failed'
  | 'machine_flushed';

@Schema({ timestamps: true })
export class AgentLog {
  @Prop({ required: true })
  agentId: string;

  @Prop({
    required: true,
    enum: [
      'customer_created',
      'membership_sold',
      'wallet_topup',
      'inspection_filed',
      'order_completed',
      'order_failed',
      'machine_flushed',
    ],
  })
  action: AgentLogAction;

  @Prop()
  targetId?: string; // customerId, orderId, machineId etc.

  @Prop()
  targetLabel?: string; // human-readable description of target

  @Prop({ type: Object })
  meta?: Record<string, unknown>; // additional context (amount, plan, etc.)

  @Prop()
  createdAt?: Date;
}

export const AgentLogSchema = SchemaFactory.createForClass(AgentLog);
