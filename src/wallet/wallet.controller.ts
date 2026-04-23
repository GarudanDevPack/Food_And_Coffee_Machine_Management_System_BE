import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { WalletService } from './wallet.service';
import { TopupDto } from './dto/topup.dto';
import { AgentTopupDto } from './dto/agent-topup.dto';
import { SubmitTopupRequestDto } from './dto/submit-topup-request.dto';
import { ReviewTopupRequestDto } from './dto/review-topup-request.dto';

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

  /**
   * GET /wallet/transactions
   * Admin: all transactions across all users, enriched with customer + agent details.
   *
   * Response format per item:
   * {
   *   id, customerId, customerName, customerPhone,
   *   amount, date, paymentMethod, status, reference,
   *   notes, processedBy, createdAt, updatedAt
   * }
   */
  @Get('transactions')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @ApiOperation({
    summary: 'Admin: all enriched transactions (with customer & agent info)',
  })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @ApiQuery({ name: 'skip', required: false, example: 0 })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by customer userId',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: [
      'topup_qr',
      'topup_bank',
      'agent_topup',
      'order_payment',
      'refund',
      'adjustment',
    ],
  })
  getAllTransactions(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('userId') userId?: string,
    @Query('category') category?: string,
  ) {
    return this.walletService.getAllTransactionsEnriched(
      limit ? parseInt(limit) : 100,
      skip ? parseInt(skip) : 0,
      userId,
      category,
    );
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

  /**
   * Agent top-up: agent credits a customer's wallet with cash collected at the outlet.
   * Records agentId as referenceId in transaction for full audit trail.
   */
  @Post('agent-topup')
  @Roles(RoleEnum.agent)
  @HttpCode(HttpStatus.CREATED)
  agentTopup(@Request() req, @Body() dto: AgentTopupDto) {
    return this.walletService.agentTopup(
      req.user.id,
      dto.targetUserId,
      dto.amount,
      dto.note,
    );
  }

  // ─── Bank Slip Top-Up Approval Queue ─────────────────────────────────────────

  /**
   * POST /wallet/topup-request
   * Customer submits a bank slip top-up request.
   * Wallet is NOT credited until an admin approves it.
   * The customer uploads their bank slip image first (POST /files/upload)
   * and provides the URL here.
   */
  @Post('topup-request')
  @Roles(RoleEnum.customer, RoleEnum.agent)
  @ApiOperation({
    summary: 'Submit a bank slip top-up request (pending admin approval)',
  })
  @ApiCreatedResponse({
    description: 'TopupRequest created with status=pending',
  })
  @HttpCode(HttpStatus.CREATED)
  submitTopupRequest(@Request() req, @Body() dto: SubmitTopupRequestDto) {
    return this.walletService.submitTopupRequest(req.user.id, dto);
  }

  /**
   * GET /wallet/topup-requests?status=pending&userId=xxx
   * Admin: list all bank slip top-up requests.
   * Filter by status (pending | approved | rejected) and/or userId.
   */
  @Get('topup-requests')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({
    summary: 'Admin: list all top-up requests (filter by status/userId)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected'],
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by customer userId',
  })
  @ApiOkResponse({ description: 'List of TopupRequest records' })
  getTopupRequests(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.walletService.getTopupRequests(status, userId);
  }

  /**
   * GET /wallet/topup-requests/mine
   * Customer views their own top-up request history.
   */
  @Get('topup-requests/mine')
  @ApiOperation({ summary: 'Get my own top-up request history' })
  @ApiOkResponse({ description: 'Top-up request history for the calling user' })
  getMyTopupRequests(@Request() req) {
    return this.walletService.getTopupRequests(undefined, req.user.id);
  }

  /**
   * PATCH /wallet/topup-requests/:id/approve
   * Admin approves a pending top-up request.
   * Automatically credits the customer's wallet and records the transactionId.
   */
  @Patch('topup-requests/:id/approve')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({
    summary: 'Admin: approve a pending top-up request (credits wallet)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB _id of the TopupRequest' })
  @ApiOkResponse({ description: 'Request approved, wallet credited' })
  @HttpCode(HttpStatus.OK)
  approveTopupRequest(
    @Param('id') id: string,
    @Body() dto: ReviewTopupRequestDto,
    @Request() req,
  ) {
    return this.walletService.approveTopupRequest(id, req.user.id, dto);
  }

  /**
   * PATCH /wallet/topup-requests/:id/reject
   * Admin rejects a pending top-up request.
   * Wallet is NOT affected. Customer can resubmit a corrected request.
   */
  @Patch('topup-requests/:id/reject')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: reject a pending top-up request' })
  @ApiParam({ name: 'id', description: 'MongoDB _id of the TopupRequest' })
  @ApiOkResponse({ description: 'Request rejected' })
  @HttpCode(HttpStatus.OK)
  rejectTopupRequest(
    @Param('id') id: string,
    @Body() dto: ReviewTopupRequestDto,
    @Request() req,
  ) {
    return this.walletService.rejectTopupRequest(id, req.user.id, dto);
  }
}
