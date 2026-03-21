import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Membership,
  MembershipDocument,
  PLAN_DISCOUNT,
  PLAN_PRICE,
  PLAN_DAYS,
} from './schemas/membership.schema';
import { WalletService } from '../wallet/wallet.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { RoleEnum } from '../roles/roles.enum';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectModel(Membership.name)
    private readonly membershipModel: Model<MembershipDocument>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Subscribe a customer to a membership plan.
   * - Customer: subscribes themselves (callerUserId === effectiveUserId)
   * - Agent: provides dto.targetUserId to subscribe on behalf of a customer
   */
  async subscribe(
    callerUserId: string,
    callerRole: RoleEnum,
    dto: CreateMembershipDto,
  ): Promise<Membership> {
    const isAgent = Number(callerRole) === RoleEnum.agent;
    const isPrivileged =
      Number(callerRole) === RoleEnum.super_admin ||
      Number(callerRole) === RoleEnum.admin;

    // Determine the effective user (customer being subscribed)
    let effectiveUserId = callerUserId;
    let agentId: string | null = null;

    if (isAgent) {
      if (!dto.targetUserId) {
        throw new BadRequestException(
          'Agents must provide targetUserId to subscribe on behalf of a customer',
        );
      }
      effectiveUserId = dto.targetUserId;
      agentId = callerUserId;
    } else if (isPrivileged) {
      if (!dto.targetUserId) {
        throw new BadRequestException(
          'Admin must provide targetUserId to subscribe on behalf of a customer',
        );
      }
      effectiveUserId = dto.targetUserId;
    }

    // Check for existing active membership
    const existing = await this.getActiveMembership(effectiveUserId);
    if (existing) {
      throw new BadRequestException(
        `Customer already has an active ${(existing as any).plan} membership valid until ${(existing as any).endDate.toISOString().split('T')[0]}`,
      );
    }

    const price = PLAN_PRICE[dto.plan];
    const discount = PLAN_DISCOUNT[dto.plan];
    const days = PLAN_DAYS[dto.plan];

    if (!price || !discount || !days) {
      throw new BadRequestException(`Invalid plan: ${dto.plan}`);
    }

    // Deduct wallet of the customer being subscribed
    const tx = await this.walletService.deduct(
      effectiveUserId,
      price,
      `membership-${dto.plan}-${Date.now()}`,
      `Membership: ${dto.plan} plan (${discount}% order discount)${agentId ? ` — sold by agent ${agentId}` : ''}`,
    );

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const membership = await new this.membershipModel({
      userId: effectiveUserId,
      plan: dto.plan,
      discount,
      startDate,
      endDate,
      status: 'active',
      pricePaid: price,
      transactionId: (tx as any).id,
      createdByAgentId: agentId,
    }).save();

    this.logger.log(
      `User ${effectiveUserId} subscribed to ${dto.plan} (${discount}% off)${agentId ? ` via agent ${agentId}` : ''}`,
    );
    return membership;
  }

  async getActiveMembership(userId: string): Promise<Membership | null> {
    return this.membershipModel
      .findOne({
        userId,
        status: 'active',
        endDate: { $gt: new Date() },
      })
      .exec();
  }

  async getMyMembership(userId: string): Promise<Membership | null> {
    return this.membershipModel
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getAll(userId?: string): Promise<Membership[]> {
    const filter: Record<string, any> = {};
    if (userId) filter.userId = userId;
    return this.membershipModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async cancelMembership(
    id: string,
    requestingUserId: string,
    callerRole: RoleEnum,
  ): Promise<Membership> {
    const membership = await this.membershipModel.findById(id).exec();
    if (!membership) throw new NotFoundException(`Membership ${id} not found`);

    const isPrivileged =
      Number(callerRole) === RoleEnum.super_admin ||
      Number(callerRole) === RoleEnum.admin ||
      Number(callerRole) === RoleEnum.agent;

    if (!isPrivileged && (membership as any).userId !== requestingUserId) {
      throw new ForbiddenException('You can only cancel your own membership');
    }

    (membership as any).status = 'cancelled';
    return (membership as any).save();
  }

  /** Daily cron — expire memberships past their endDate */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireMemberships(): Promise<void> {
    const result = await this.membershipModel.updateMany(
      { status: 'active', endDate: { $lt: new Date() } },
      { $set: { status: 'expired' } },
    );
    if (result.modifiedCount > 0) {
      this.logger.log(`Expired ${result.modifiedCount} memberships`);
    }
  }
}
