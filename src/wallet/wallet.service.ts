import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import {
  TopupRequest,
  TopupRequestDocument,
} from './schemas/topup-request.schema';
import { TopupDto } from './dto/topup.dto';
import { SubmitTopupRequestDto } from './dto/submit-topup-request.dto';
import { ReviewTopupRequestDto } from './dto/review-topup-request.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(Wallet.name)
    private readonly walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
    @InjectModel(TopupRequest.name)
    private readonly topupRequestModel: Model<TopupRequestDocument>,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    const existing = await this.walletModel.findOne({ userId }).exec();
    if (existing) return existing;
    return new this.walletModel({ userId }).save();
  }

  /**
   * Create wallet with a specific public walletId (used during customer registration).
   * Idempotent — returns existing wallet if one already exists for the userId.
   */
  async createWalletForCustomer(
    userId: string,
    walletId: string,
  ): Promise<Wallet> {
    const existing = await this.walletModel.findOne({ userId }).exec();
    if (existing) return existing;
    return new this.walletModel({ userId, walletId }).save();
  }

  async getWallet(userId: string): Promise<Wallet> {
    const wallet = await this.walletModel.findOne({ userId }).exec();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getBalance(userId: string): Promise<{ balance: number }> {
    const wallet = await this.getWallet(userId);
    return { balance: wallet.balance };
  }

  async topup(userId: string, dto: TopupDto): Promise<TransactionDocument> {
    // Atomic credit — returns the wallet document BEFORE the increment so we
    // can record accurate balanceBefore / balanceAfter in the transaction.
    const walletBefore = await this.walletModel
      .findOneAndUpdate(
        { userId },
        { $inc: { balance: dto.amount } },
        { new: false },
      )
      .exec();
    if (!walletBefore) throw new NotFoundException('Wallet not found');

    const balanceBefore = walletBefore.balance;
    const balanceAfter = balanceBefore + dto.amount;

    const tx = await new this.txModel({
      walletId: walletBefore.id,
      userId,
      amount: dto.amount,
      type: 'credit',
      category: dto.category,
      referenceId: dto.referenceId,
      paymentSlipUrl: dto.paymentSlipUrl,
      description: `Top-up via ${dto.category}`,
      balanceBefore,
      balanceAfter,
      status: 'completed',
    }).save();
    return tx.toObject();
  }

  async deduct(
    userId: string,
    amount: number,
    referenceId: string,
    description: string,
  ): Promise<TransactionDocument> {
    // Atomic deduction: the $gte filter ensures balance never goes negative
    // even under concurrent requests. Returns doc BEFORE update for accurate audit trail.
    const walletBefore = await this.walletModel
      .findOneAndUpdate(
        { userId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: false },
      )
      .exec();

    if (!walletBefore) {
      const exists = await this.walletModel.findOne({ userId }).exec();
      if (!exists) throw new NotFoundException('Wallet not found');
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balanceBefore = walletBefore.balance;
    const balanceAfter = balanceBefore - amount;

    const tx = await new this.txModel({
      walletId: walletBefore.id,
      userId,
      amount,
      type: 'debit',
      category: 'order_payment',
      referenceId,
      description,
      balanceBefore,
      balanceAfter,
      status: 'completed',
    }).save();
    return tx.toObject();
  }

  async refund(
    userId: string,
    amount: number,
    referenceId: string,
  ): Promise<TransactionDocument> {
    // Idempotency guard — prevent double-refund if handler is called twice for same order
    const existing = await this.txModel
      .findOne({ userId, referenceId, category: 'refund' })
      .exec();
    if (existing) {
      this.logger.warn(
        `Refund for order ${referenceId} already processed — skipping duplicate`,
      );
      return existing.toObject();
    }

    // Atomic credit — returns doc BEFORE update for accurate audit trail
    const walletBefore = await this.walletModel
      .findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { new: false },
      )
      .exec();
    if (!walletBefore) throw new NotFoundException('Wallet not found');

    const balanceBefore = walletBefore.balance;
    const balanceAfter = balanceBefore + amount;

    const tx = await new this.txModel({
      walletId: walletBefore.id,
      userId,
      amount,
      type: 'credit',
      category: 'refund',
      referenceId,
      description: 'Order refund',
      balanceBefore,
      balanceAfter,
      status: 'completed',
    }).save();
    return tx.toObject();
  }

  async getTransactions(
    userId: string,
    limit = 50,
    skip = 0,
  ): Promise<Transaction[]> {
    return this.txModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  /**
   * Agent credits a customer's wallet (e.g. cash payment at the outlet).
   * Records the agentId in the transaction description for audit.
   */
  async agentTopup(
    agentId: string,
    targetUserId: string,
    amount: number,
    note?: string,
  ): Promise<TransactionDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    // Atomic credit — returns doc BEFORE update for accurate audit trail
    const walletBefore = await this.walletModel
      .findOneAndUpdate(
        { userId: targetUserId },
        { $inc: { balance: amount } },
        { new: false },
      )
      .exec();
    if (!walletBefore) throw new NotFoundException('Customer wallet not found');

    const balanceBefore = walletBefore.balance;
    const balanceAfter = balanceBefore + amount;

    const tx = await new this.txModel({
      walletId: walletBefore.id,
      userId: targetUserId,
      amount,
      type: 'credit',
      category: 'agent_topup',
      referenceId: agentId,
      description: note
        ? `Agent top-up: ${note} (by agent ${agentId})`
        : `Agent top-up by ${agentId}`,
      balanceBefore,
      balanceAfter,
      status: 'completed',
    }).save();
    return tx.toObject();
  }

  async getWalletByWalletId(walletId: string): Promise<Wallet> {
    const wallet = await this.walletModel.findOne({ walletId }).exec();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /** Increment (positive) or decrement (negative) wallet balance by userId */
  async updateWalletBalance(userId: string, delta: number): Promise<Wallet> {
    const wallet = await this.walletModel
      .findOneAndUpdate({ userId }, { $inc: { balance: delta } }, { new: true })
      .exec();
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async getAllWallets(): Promise<Wallet[]> {
    return this.walletModel.find().exec();
  }

  // ─── Bank Slip Top-Up Request Queue ─────────────────────────────────────────

  /**
   * Customer submits a bank-slip top-up request.
   * The request is created with status=pending and enters the admin review queue.
   * Wallet is NOT credited until an admin calls approveTopupRequest().
   *
   * @param userId - MongoDB _id of the customer submitting the request
   * @param dto    - { amount, paymentSlipUrl, note? }
   * @returns The created TopupRequest record (status=pending)
   * @throws BadRequestException if amount <= 0
   */
  async submitTopupRequest(
    userId: string,
    dto: SubmitTopupRequestDto,
  ): Promise<TopupRequest> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than zero');
    }

    const request = await new this.topupRequestModel({
      userId,
      amount: dto.amount,
      paymentSlipUrl: dto.paymentSlipUrl,
      note: dto.note ?? null,
      status: 'pending',
    }).save();

    this.logger.log(
      `TopupRequest submitted by user ${userId}: ${dto.amount} LKR (id=${request.id})`,
    );
    return request;
  }

  /**
   * List top-up requests.
   * - Admin: pass no userId → returns all requests, optionally filtered by status
   * - Customer: pass userId → returns only their own requests
   *
   * @param status - Optional filter: 'pending' | 'approved' | 'rejected'
   * @param userId - Optional customer filter (omit to get all — admin only)
   * @returns Array of TopupRequest records sorted newest first
   */
  async getTopupRequests(
    status?: string,
    userId?: string,
  ): Promise<TopupRequest[]> {
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    return this.topupRequestModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /**
   * Admin approves a pending top-up request.
   * Credits the customer's wallet and records the transactionId on the request.
   *
   * @param requestId - MongoDB _id of the TopupRequest
   * @param adminId   - MongoDB _id of the admin approving the request
   * @param dto       - { reviewNote? } — optional admin note
   * @returns The updated TopupRequest with status=approved and transactionId set
   * @throws NotFoundException  if the request does not exist
   * @throws BadRequestException if the request is not in pending status
   */
  async approveTopupRequest(
    requestId: string,
    adminId: string,
    dto: ReviewTopupRequestDto,
  ): Promise<TopupRequest> {
    const request = await this.topupRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException(`TopupRequest ${requestId} not found`);
    }
    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Cannot approve a request with status "${request.status}". Only pending requests can be approved.`,
      );
    }

    // Credit the customer's wallet using the existing topup flow (creates transaction record)
    const tx = await this.topup(request.userId, {
      amount: request.amount,
      category: 'topup_bank',
      paymentSlipUrl: request.paymentSlipUrl,
      referenceId: requestId,
    });

    request.status = 'approved';
    request.reviewedBy = adminId;
    request.reviewNote = dto.reviewNote ?? undefined;
    request.transactionId = (tx as any).id;
    const saved = await request.save();

    this.logger.log(
      `TopupRequest ${requestId} approved by admin ${adminId}: ${request.amount} LKR credited to user ${request.userId}`,
    );
    return saved;
  }

  /**
   * Admin rejects a pending top-up request.
   * Wallet is NOT affected. The customer can resubmit a corrected request.
   *
   * @param requestId - MongoDB _id of the TopupRequest
   * @param adminId   - MongoDB _id of the admin rejecting the request
   * @param dto       - { reviewNote? } — reason for rejection (shown to customer)
   * @returns The updated TopupRequest with status=rejected
   * @throws NotFoundException  if the request does not exist
   * @throws BadRequestException if the request is not in pending status
   */
  async rejectTopupRequest(
    requestId: string,
    adminId: string,
    dto: ReviewTopupRequestDto,
  ): Promise<TopupRequest> {
    const request = await this.topupRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException(`TopupRequest ${requestId} not found`);
    }
    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Cannot reject a request with status "${request.status}". Only pending requests can be rejected.`,
      );
    }

    request.status = 'rejected';
    request.reviewedBy = adminId;
    request.reviewNote = dto.reviewNote ?? undefined;
    const saved = await request.save();

    this.logger.log(
      `TopupRequest ${requestId} rejected by admin ${adminId}: ${request.amount} LKR request for user ${request.userId}`,
    );
    return saved;
  }
}
