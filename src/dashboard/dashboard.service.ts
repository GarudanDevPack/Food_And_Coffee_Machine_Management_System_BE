import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Machine, MachineDocument } from '../machines/schemas/machine.schema';
import { Transaction, TransactionDocument } from '../wallet/schemas/transaction.schema';
import { Alert, AlertDocument } from '../alerts/schemas/alert.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Machine.name) private readonly machineModel: Model<MachineDocument>,
    @InjectModel(Transaction.name) private readonly txModel: Model<TransactionDocument>,
    @InjectModel(Alert.name) private readonly alertModel: Model<AlertDocument>,
  ) {}

  async getSummary(clientId?: string) {
    const machineFilter = clientId ? { clientId } : {};

    const [
      totalMachines,
      activeMachines,
      totalOrders,
      completedOrders,
      revenue,
      unresolvedAlerts,
    ] = await Promise.all([
      this.machineModel.countDocuments(machineFilter),
      this.machineModel.countDocuments({ ...machineFilter, status: 'active' }),
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({ status: 'completed' }),
      this.orderModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.alertModel.countDocuments({ isResolved: false }),
    ]);

    return {
      totalMachines,
      activeMachines,
      totalOrders,
      completedOrders,
      totalRevenue: revenue[0]?.total ?? 0,
      unresolvedAlerts,
    };
  }

  async getOrdersOverTime(days = 30, machineId?: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match: Record<string, unknown> = { createdAt: { $gte: startDate } };
    if (machineId) match.machineId = machineId;

    return this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]);
  }

  async getTopItems(limit = 10) {
    return this.orderModel.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$itemId',
          itemName: { $first: '$itemName' },
          count: { $sum: '$quantity' },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
  }

  async getMachinePerformance(clientId?: string) {
    const matchFilter = clientId ? { clientId } : {};
    const machines = await this.machineModel.find(matchFilter).exec();

    const stats = await this.orderModel.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$machineId',
          orderCount: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
        },
      },
    ]);

    const statsMap = new Map(stats.map((s) => [s._id, s]));

    return machines.map((m) => ({
      machineId: m.machineId,
      name: m.name,
      location: m.location,
      status: m.status,
      isOnline: m.isOnline,
      orderCount: statsMap.get(m.machineId)?.orderCount ?? 0,
      revenue: statsMap.get(m.machineId)?.revenue ?? 0,
    }));
  }

  async getRevenueByMachine(startDate?: string, endDate?: string) {
    const match: Record<string, unknown> = { status: 'completed' };
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      match.createdAt = dateFilter;
    }

    return this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$machineId',
          totalRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);
  }
}
