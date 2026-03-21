import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Reservation, ReservationDocument } from './schemas/reservation.schema';
import { CreateReservationDto } from './dto/create-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
  ) {}

  async create(
    dto: CreateReservationDto,
    userId: string,
  ): Promise<Reservation> {
    return this.reservationModel.create({ ...dto, userId, status: 'pending' });
  }

  async findAll(filters?: {
    userId?: string;
    machineId?: string;
    status?: string;
    date?: string;
  }) {
    const query: any = {};
    if (filters?.userId) query.userId = filters.userId;
    if (filters?.machineId) query.machineId = filters.machineId;
    if (filters?.status) query.status = filters.status;
    if (filters?.date) query.date = filters.date;
    return this.reservationModel
      .find(query)
      .sort({ date: 1, createdAt: -1 })
      .lean();
  }

  async findOne(id: string): Promise<Reservation> {
    const res = await this.reservationModel.findById(id).lean();
    if (!res) throw new NotFoundException('Reservation not found');
    return res;
  }

  async myReservations(userId: string) {
    return this.reservationModel
      .find({ userId })
      .sort({ date: 1, createdAt: -1 })
      .lean();
  }

  async confirm(id: string): Promise<Reservation> {
    const res = await this.reservationModel.findByIdAndUpdate(
      id,
      { status: 'confirmed', confirmedAt: new Date() },
      { new: true },
    );
    if (!res) throw new NotFoundException('Reservation not found');
    return res;
  }

  async complete(id: string): Promise<Reservation> {
    const res = await this.reservationModel.findByIdAndUpdate(
      id,
      { status: 'completed', completedAt: new Date() },
      { new: true },
    );
    if (!res) throw new NotFoundException('Reservation not found');
    return res;
  }

  async cancel(
    id: string,
    userId: string,
    reason?: string,
    isAdmin = false,
  ): Promise<Reservation> {
    const existing = await this.reservationModel.findById(id);
    if (!existing) throw new NotFoundException('Reservation not found');
    if (!isAdmin && existing.userId !== userId)
      throw new ForbiddenException('Not your reservation');
    const res = await this.reservationModel.findByIdAndUpdate(
      id,
      { status: 'cancelled', cancelReason: reason },
      { new: true },
    );
    return res!;
  }

  async remove(id: string): Promise<void> {
    await this.reservationModel.findByIdAndDelete(id);
  }
}
