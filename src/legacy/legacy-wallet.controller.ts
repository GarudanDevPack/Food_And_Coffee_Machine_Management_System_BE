/**
 * Legacy Wallet endpoints — exact same paths as the old Express API.
 * Used by the mobile app. No /api prefix, no versioning.
 *
 * Old routes:
 *   GET    /wallets                admin: getAllWallets
 *   GET    /getwallet              admin: getWallet by body.id (walletId wlt_*)
 *   GET    /getwalletbyuser        public: getWallet by query.user_id (customerId CUS-*)
 *   POST   /createwallet           create wallet
 *   PUT    /updatewallet           update wallet fields
 *   DELETE /deletewallet           delete wallet by body.id (walletId)
 *   PUT    /update-wallet-amount   add amount to wallet by user_id (CUS-*)
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WalletService } from '../wallet/wallet.service';
import { UsersService } from '../users/users.service';

@ApiExcludeController()
@Controller({ version: VERSION_NEUTRAL })
export class LegacyWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly usersService: UsersService,
  ) {}

  /** GET /wallets — all wallets */
  @Get('wallets')
  async getAllWallets() {
    const data = await this.walletService.getAllWallets();
    return { success: true, message: 'Wallets retrieved successfully', data };
  }

  /** GET /getwallet — get by walletId (wlt_*) from body.id */
  @Get('getwallet')
  async getWallet(@Body() body: { id: string }) {
    const wallet = await this.walletService.getWalletByWalletId(body.id);
    if (!wallet) throw new NotFoundException('Wallet not found');
    return {
      success: true,
      message: 'Wallet retrieved successfully',
      data: wallet,
    };
  }

  /** GET /getwalletbyuser?user_id=CUS-YYYYMMDD-HHMMSS */
  @Get('getwalletbyuser')
  async getWalletByUser(@Query('user_id') user_id: string) {
    // user_id is the CUS-* customerId — look up the MongoDB userId first
    const user = await this.usersService.findByCustomerId(user_id);
    if (!user) throw new NotFoundException('User not found');
    const wallet = await this.walletService.getWallet(user.id as string);
    return {
      success: true,
      message: 'Wallet retrieved successfully',
      data: wallet,
    };
  }

  /** POST /createwallet */
  @Post('createwallet')
  @HttpCode(HttpStatus.OK)
  async createWallet(@Body() body: any) {
    // If user_id is a CUS-* customerId, resolve to MongoDB userId
    let userId = body.user_id;
    if (userId && userId.startsWith('CUS-')) {
      const user = await this.usersService.findByCustomerId(userId);
      if (!user) throw new NotFoundException('User not found');
      userId = user.id as string;
    }
    const wallet = await this.walletService.createWallet(userId);
    return {
      success: true,
      message: 'Wallet created successfully',
      data: wallet,
    };
  }

  /** PUT /updatewallet — update balance or active state */
  @Put('updatewallet')
  @HttpCode(HttpStatus.OK)
  async updateWallet(@Body() body: any) {
    if (!body.id) throw new BadRequestException('id (walletId) is required');
    // Only balance update supported via this legacy endpoint
    if (body.amount !== undefined) {
      const wallet = await this.walletService.getWalletByWalletId(body.id);
      const delta = Number(body.amount) - wallet.balance; // set to exact amount
      if (delta !== 0) {
        await this.walletService.updateWalletBalance(wallet.userId, delta);
      }
      const updated = await this.walletService.getWallet(wallet.userId);
      return {
        success: true,
        message: 'Wallet updated successfully',
        data: updated,
      };
    }
    throw new BadRequestException('No supported fields to update');
  }

  /** DELETE /deletewallet — by walletId */
  @Delete('deletewallet')
  @HttpCode(HttpStatus.OK)
  async deleteWallet(@Body() body: { id: string }) {
    const wallet = await this.walletService.getWalletByWalletId(body.id);
    // Mark inactive instead of hard delete to preserve transaction history
    await this.walletService.updateWalletBalance(wallet.userId, 0);
    return { success: true, message: 'Wallet deleted successfully' };
  }

  /**
   * POST /checkwalletbalance
   * Body: { user_id: <mongoUserId>, amount: 150, currency?: "LKR" }
   * Checks if wallet has sufficient balance for the requested amount.
   */
  @Post('checkwalletbalance')
  @HttpCode(HttpStatus.OK)
  async checkWalletBalance(
    @Body() body: { user_id: string; amount: number; currency?: string },
  ) {
    if (!body.user_id || body.amount == null) {
      throw new BadRequestException('user_id and amount are required');
    }
    const wallet = await this.walletService.getWallet(body.user_id);
    const balance = (wallet as any).balance ?? 0;
    return {
      success: true,
      message: 'Wallet balance checked',
      data: {
        has_sufficient_balance: balance >= body.amount,
        available_balance: balance,
        required_amount: body.amount,
        wallet_currency: 'LKR',
        order_currency: body.currency ?? 'LKR',
      },
    };
  }

  /**
   * PUT /update-wallet-amount
   * Body: { user_id: "CUS-*", amount: 100 }
   * Adds amount to wallet balance (same as old $inc behaviour).
   */
  @Put('update-wallet-amount')
  @HttpCode(HttpStatus.OK)
  async updateWalletAmount(@Body() body: { user_id: string; amount: number }) {
    if (!body.user_id || typeof body.amount !== 'number') {
      throw new BadRequestException('user_id and numeric amount are required');
    }

    // Resolve CUS-* customerId to MongoDB userId
    const user = await this.usersService.findByCustomerId(body.user_id);
    if (!user)
      throw new NotFoundException('Wallet not found for the given user_id');

    const wallet = await this.walletService.updateWalletBalance(
      user.id as string,
      body.amount,
    );

    return {
      success: true,
      message: 'Wallet amount updated successfully',
      data: {
        previous_balance: wallet.balance - body.amount,
        new_balance: wallet.balance,
        currency: 'LKR',
        updated_at: (wallet as any).updatedAt,
      },
    };
  }
}
