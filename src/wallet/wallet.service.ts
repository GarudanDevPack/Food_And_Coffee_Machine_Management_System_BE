import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from './schemas/wallet.schema';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { TopupDto } from './dto/topup.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(Wallet.name) private readonly walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private readonly txModel: Model<TransactionDocument>,
  ) {}

  async createWallet(userId: string): Promise<Wallet> {
    const existing = await this.walletModel.findOne({ userId }).exec();
    if (existing) return existing;
    return new this.walletModel({ userId }).save();
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
    const wallet = await this.walletModel.findOne({ userId }).exec();
    if (!wallet) throw new NotFoundException('Wallet not found');

    const balanceBefore = wallet.balance;
    wallet.balance += dto.amount;
    await wallet.save();

    return new this.txModel({
      walletId: wallet.id,
      userId,
      amount: dto.amount,
      type: 'credit',
      category: dto.category,
      referenceId: dto.referenceId,
      paymentSlipUrl: dto.paymentSlipUrl,
      description: `Top-up via ${dto.category}`,
      balanceBefore,
      balanceAfter: wallet.balance,
      status: 'completed',
    }).save();
  }

  async deduct(userId: string, amount: number, referenceId: string, description: string): Promise<TransactionDocument> {
    const wallet = await this.walletModel.findOne({ userId }).exec();
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balanceBefore = wallet.balance;
    wallet.balance -= amount;
    await wallet.save();

    return new this.txModel({
      walletId: wallet.id,
      userId,
      amount,
      type: 'debit',
      category: 'order_payment',
      referenceId,
      description,
      balanceBefore,
      balanceAfter: wallet.balance,
      status: 'completed',
    }).save();
  }

  async refund(userId: string, amount: number, referenceId: string): Promise<TransactionDocument> {
    const wallet = await this.walletModel.findOne({ userId }).exec();
    if (!wallet) throw new NotFoundException('Wallet not found');

    const balanceBefore = wallet.balance;
    wallet.balance += amount;
    await wallet.save();

    return new this.txModel({
      walletId: wallet.id,
      userId,
      amount,
      type: 'credit',
      category: 'refund',
      referenceId,
      description: 'Order refund',
      balanceBefore,
      balanceAfter: wallet.balance,
      status: 'completed',
    }).save();
  }

  async getTransactions(userId: string, limit = 50, skip = 0): Promise<Transaction[]> {
    return this.txModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async getAllWallets(): Promise<Wallet[]> {
    return this.walletModel.find().exec();
  }
}
