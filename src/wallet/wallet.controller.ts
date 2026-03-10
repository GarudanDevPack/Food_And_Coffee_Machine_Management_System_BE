import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  getMyWallet(@Request() req) {
    return this.walletService.getWallet(req.user.id);
  }

  @Get('me/balance')
  getBalance(@Request() req) {
    return this.walletService.getBalance(req.user.id);
  }

  @Post('me/topup')
  @Roles(RoleEnum.customer, RoleEnum.agent)
  @HttpCode(HttpStatus.CREATED)
  topup(@Request() req, @Body() dto: TopupDto) {
    return this.walletService.topup(req.user.id, dto);
  }

  @Get('me/transactions')
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'skip', required: false })
  getTransactions(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.walletService.getTransactions(
      req.user.id,
      limit ? parseInt(limit) : 50,
      skip ? parseInt(skip) : 0,
    );
  }

  // Admin: get all wallets
  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  getAllWallets() {
    return this.walletService.getAllWallets();
  }

  // Admin: get specific user's wallet
  @Get('user/:userId')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  getUserWallet(@Param('userId') userId: string) {
    return this.walletService.getWallet(userId);
  }

  // Admin: manual topup for a user
  @Post('user/:userId/topup')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.CREATED)
  adminTopup(@Param('userId') userId: string, @Body() dto: TopupDto) {
    return this.walletService.topup(userId, dto);
  }
}
