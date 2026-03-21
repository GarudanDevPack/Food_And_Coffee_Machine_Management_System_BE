import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

export type TimeSlot = 'morning' | 'lunch' | 'dinner' | 'custom';
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

@Schema({ timestamps: true })
export class Reservation {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) machineId: string;
  @Prop({ required: true }) itemId: string;
  @Prop({ required: true }) itemName: string;
  @Prop({ required: true }) date: string; // ISO date string YYYY-MM-DD
  @Prop({ required: true, enum: ['morning', 'lunch', 'dinner', 'custom'] })
  timeSlot: TimeSlot;
  @Prop() customTime?: string; // HH:MM if timeSlot = 'custom'
  @Prop({ default: 1, min: 1 }) quantity: number;
  @Prop({
    default: 'pending',
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
  })
  status: ReservationStatus;
  @Prop() note?: string;
  @Prop() cancelReason?: string;
  @Prop() confirmedAt?: Date;
  @Prop() completedAt?: Date;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);
