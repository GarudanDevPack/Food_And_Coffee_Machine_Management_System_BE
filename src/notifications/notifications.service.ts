import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(
    userId: string,
    title: string,
    message: string,
    type = 'system',
    referenceId?: string,
  ): Promise<Notification> {
    return new this.notificationModel({ userId, title, message, type, referenceId }).save();
  }

  async findAll(userId: string, unreadOnly = false): Promise<Notification[]> {
    const filter: Record<string, unknown> = { userId };
    if (unreadOnly) filter.isRead = false;
    return this.notificationModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notif = await this.notificationModel
      .findOneAndUpdate({ _id: id, userId }, { isRead: true }, { new: true })
      .exec();
    if (!notif) throw new NotFoundException(`Notification ${id} not found`);
    return notif;
  }

  async markAllRead(userId: string): Promise<{ modified: number }> {
    const result = await this.notificationModel
      .updateMany({ userId, isRead: false }, { isRead: true })
      .exec();
    return { modified: result.modifiedCount };
  }

  async remove(id: string): Promise<void> {
    await this.notificationModel.findByIdAndDelete(id).exec();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, isRead: false }).exec();
  }
}
