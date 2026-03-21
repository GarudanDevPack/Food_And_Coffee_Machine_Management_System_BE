import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
  ) {}

  // ─── Auto-generate orgId ────────────────────────────────────────────────────

  private async generateOrgId(): Promise<string> {
    const count = await this.orgModel.countDocuments();
    const seq = String(count + 1).padStart(3, '0');
    return `ORG-${seq}`;
  }

  // ─── Admin CRUD ──────────────────────────────────────────────────────────────

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.orgModel.findOne({
      clientUserId: dto.clientUserId,
    });
    if (existing) {
      throw new ConflictException(
        'This client user already has an organization.',
      );
    }

    const orgId = await this.generateOrgId();
    const org = new this.orgModel({
      orgId,
      name: dto.name,
      clientUserId: dto.clientUserId,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      logoUrl: dto.logoUrl ?? null,
      contractStart: new Date(dto.contractStart),
      contractEnd: dto.contractEnd ? new Date(dto.contractEnd) : null,
      notes: dto.notes ?? null,
    });
    return org.save();
  }

  async findAll(): Promise<Organization[]> {
    return this.orgModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgModel.findById(id).lean().exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async findByClientUserId(clientUserId: string): Promise<Organization> {
    const org = await this.orgModel.findOne({ clientUserId }).lean().exec();
    if (!org)
      throw new NotFoundException('Organization not found for this client');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const updates: Partial<Organization> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.address !== undefined) updates.address = dto.address;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.email !== undefined) updates.email = dto.email;
    if (dto.logoUrl !== undefined) updates.logoUrl = dto.logoUrl;
    if (dto.notes !== undefined) updates.notes = dto.notes;
    if (dto.contractStart !== undefined)
      updates.contractStart = new Date(dto.contractStart);
    if (dto.contractEnd !== undefined)
      updates.contractEnd = dto.contractEnd ? new Date(dto.contractEnd) : null;

    const org = await this.orgModel
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async softDelete(id: string): Promise<{ message: string }> {
    const org = await this.orgModel
      .findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true })
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return { message: 'Organization deactivated successfully' };
  }

  // ─── Agent Assignment ────────────────────────────────────────────────────────

  async assignAgent(id: string, agentId: string): Promise<Organization> {
    const org = await this.orgModel
      .findByIdAndUpdate(
        id,
        { $addToSet: { agentIds: agentId } },
        { new: true },
      )
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async removeAgent(id: string, agentId: string): Promise<Organization> {
    const org = await this.orgModel
      .findByIdAndUpdate(id, { $pull: { agentIds: agentId } }, { new: true })
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  // ─── Machine Assignment ──────────────────────────────────────────────────────

  async assignMachine(id: string, machineId: string): Promise<Organization> {
    const org = await this.orgModel
      .findByIdAndUpdate(
        id,
        { $addToSet: { machineIds: machineId } },
        { new: true },
      )
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async removeMachine(id: string, machineId: string): Promise<Organization> {
    const org = await this.orgModel
      .findByIdAndUpdate(
        id,
        { $pull: { machineIds: machineId } },
        { new: true },
      )
      .lean()
      .exec();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  // ─── Client Dashboard (scoped KPIs) ─────────────────────────────────────────

  async getDashboard(clientUserId: string) {
    const org = await this.findByClientUserId(clientUserId);
    const machineIds = org.machineIds;

    if (machineIds.length === 0) {
      return {
        org: { orgId: org.orgId, name: org.name },
        totalMachines: 0,
        totalOrders: 0,
        completedOrders: 0,
        totalRevenue: 0,
        avgOrderValue: 0,
      };
    }

    const [totalOrders, completedOrders, revenueAgg] = await Promise.all([
      this.orderModel.countDocuments({ machineId: { $in: machineIds } }),
      this.orderModel.countDocuments({
        machineId: { $in: machineIds },
        status: 'completed',
      }),
      this.orderModel.aggregate([
        { $match: { machineId: { $in: machineIds }, status: 'completed' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRevenue = revenueAgg[0]?.total ?? 0;
    const completedCount = revenueAgg[0]?.count ?? 0;
    const avgOrderValue =
      completedCount > 0 ? totalRevenue / completedCount : 0;

    return {
      org: { orgId: org.orgId, name: org.name },
      totalMachines: machineIds.length,
      totalOrders,
      completedOrders,
      totalRevenue,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    };
  }

  // ─── Revenue Report ──────────────────────────────────────────────────────────

  async getRevenueReport(clientUserId: string, month?: string) {
    const org = await this.findByClientUserId(clientUserId);
    const machineIds = org.machineIds;

    const baseMatch: Record<string, unknown> = {
      machineId: { $in: machineIds },
    };

    if (month) {
      // month format: YYYY-MM
      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end = new Date(year, mon, 1); // first day of next month
      baseMatch.createdAt = { $gte: start, $lt: end };
    }

    const [summary, byDay, byMachine] = await Promise.all([
      // Overall summary
      this.orderModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            totalRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, '$totalAmount', 0],
              },
            },
            totalDiscount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 'completed'] },
                      { $gt: [{ $ifNull: ['$discountApplied', 0] }, 0] },
                    ],
                  },
                  {
                    $subtract: [
                      { $ifNull: ['$originalAmount', '$totalAmount'] },
                      '$totalAmount',
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      ]),

      // Group by day (for chart)
      this.orderModel.aggregate([
        { $match: { ...baseMatch, status: 'completed' } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            orderCount: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      // Per-machine breakdown
      this.orderModel.aggregate([
        { $match: { ...baseMatch, status: 'completed' } },
        {
          $group: {
            _id: '$machineId',
            orderCount: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    const s = summary[0] ?? {
      totalOrders: 0,
      completedOrders: 0,
      totalRevenue: 0,
      totalDiscount: 0,
    };
    const avgOrderValue =
      s.completedOrders > 0
        ? Math.round((s.totalRevenue / s.completedOrders) * 100) / 100
        : 0;

    return {
      org: { orgId: org.orgId, name: org.name },
      period: month ?? 'all-time',
      summary: {
        totalOrders: s.totalOrders,
        completedOrders: s.completedOrders,
        totalRevenue: s.totalRevenue,
        totalDiscount: s.totalDiscount,
        avgOrderValue,
      },
      byDay,
      byMachine,
    };
  }
}
