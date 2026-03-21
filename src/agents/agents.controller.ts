import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  Query,
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
import { JwtAuth } from '../auth/guards/jwt-auth.guard';
import { RoleEnum } from '../roles/roles.enum';
import { AgentsService, AgentDashboardResult } from './agents.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { CreateMembershipDto } from '../memberships/dto/create-membership.dto';
import { AgentTopupDto } from '../wallet/dto/agent-topup.dto';
import { FailOrderDto } from './dto/fail-order.dto';

/**
 * AgentsController — HTTP routing layer for agent-facing operations.
 *
 * Design principle: this controller is intentionally thin.
 * All business logic, cross-service orchestration, and validation
 * lives in AgentsService. Methods here only:
 *   1. Extract path/query/body params from the request
 *   2. Delegate to AgentsService
 *   3. Return the result
 *
 * All endpoints require a valid JWT with role=agent.
 */
@ApiTags('Agents')
@ApiBearerAuth()
@JwtAuth(RoleEnum.agent)
@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  /**
   * GET /agents/dashboard
   * Returns KPI summary for the calling agent:
   *   - assignedMachines, todayOrders, pendingOrders, totalRevenue
   *   - machines (up to 5), recentOrders (up to 5)
   */
  @Get('dashboard')
  @ApiOperation({ summary: 'Agent dashboard KPIs' })
  @ApiOkResponse({ description: 'KPI summary for the calling agent' })
  getDashboard(@Request() req): Promise<AgentDashboardResult> {
    return this.agentsService.getDashboard(req.user.id);
  }

  // ─── Machines ────────────────────────────────────────────────────────────────

  /**
   * GET /agents/my-machines
   * Returns all machines assigned to the calling agent.
   */
  @Get('my-machines')
  @ApiOperation({ summary: 'Get machines assigned to the calling agent' })
  @ApiOkResponse({ description: 'List of machines assigned to this agent' })
  getMyMachines(@Request() req) {
    return this.agentsService.getMyMachines(req.user.id);
  }

  /**
   * POST /agents/my-machines/:machineId/flush?type=daily|weekly
   * Sends a flush command to a specific assigned machine.
   */
  @Post('my-machines/:machineId/flush')
  @ApiOperation({
    summary: 'Trigger a daily or weekly flush on an assigned machine',
  })
  @ApiParam({
    name: 'machineId',
    description: 'Human-readable machine ID (e.g. MCH-001)',
  })
  @ApiQuery({ name: 'type', enum: ['daily', 'weekly'], required: false })
  @ApiOkResponse({ description: 'Flush command published to machine' })
  @HttpCode(HttpStatus.OK)
  triggerFlush(
    @Param('machineId') machineId: string,
    @Query('type') type: 'daily' | 'weekly' = 'daily',
  ) {
    return this.agentsService.triggerFlush(machineId, type);
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  /**
   * GET /agents/orders?status=pending|dispensing|completed|failed
   * Returns all orders for machines assigned to this agent.
   */
  @Get('orders')
  @ApiOperation({ summary: "Get orders for agent's assigned machines" })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by order status',
  })
  @ApiOkResponse({ description: 'List of orders for assigned machines' })
  getOrders(@Request() req, @Query('status') status?: string) {
    return this.agentsService.getOrders(req.user.id, status);
  }

  /**
   * PATCH /agents/orders/:id/complete
   * Marks an order as completed.
   * Throws 403 if the machine is not assigned to this agent.
   */
  @Patch('orders/:id/complete')
  @ApiOperation({ summary: 'Mark an order as completed' })
  @ApiParam({ name: 'id', description: 'MongoDB _id of the order' })
  @ApiOkResponse({ description: 'Updated order record' })
  completeOrder(@Param('id') id: string, @Request() req) {
    return this.agentsService.completeOrder(id, req.user.id);
  }

  /**
   * PATCH /agents/orders/:id/fail
   * Marks an order as failed. Auto-refunds wallet if order was in dispensing state.
   * Throws 403 if the machine is not assigned to this agent.
   */
  @Patch('orders/:id/fail')
  @ApiOperation({
    summary: 'Mark an order as failed (auto-refunds wallet if applicable)',
  })
  @ApiParam({ name: 'id', description: 'MongoDB _id of the order' })
  @ApiOkResponse({ description: 'Updated order record' })
  failOrder(
    @Param('id') id: string,
    @Body() dto: FailOrderDto,
    @Request() req,
  ) {
    return this.agentsService.failOrder(id, dto.reason, req.user.id);
  }

  // ─── Customer Management ─────────────────────────────────────────────────────

  /**
   * POST /agents/customers
   * Creates a new customer account on behalf of the agent.
   * Role is always forced to `customer` — agents cannot create privileged accounts.
   * Auto-generates: CUS-YYYYMMDD-HHMMSS ID + wallet.
   */
  @Post('customers')
  @ApiOperation({
    summary: 'Create a new customer account (auto-generates ID + wallet)',
  })
  @ApiCreatedResponse({
    description: 'Created customer with auto-generated ID and wallet',
  })
  @HttpCode(HttpStatus.CREATED)
  createCustomer(@Body() dto: CreateUserDto, @Request() req) {
    return this.agentsService.createCustomer(req.user.id, dto);
  }

  /**
   * POST /agents/customers/:targetUserId/subscribe
   * Subscribes a customer to a membership plan.
   * Deducts the subscription fee from the customer's wallet.
   */
  @Post('customers/:targetUserId/subscribe')
  @ApiOperation({
    summary: 'Subscribe a customer to a membership plan on their behalf',
  })
  @ApiParam({
    name: 'targetUserId',
    description: 'MongoDB _id of the target customer',
  })
  @ApiCreatedResponse({
    description: 'Active membership record for the customer',
  })
  @HttpCode(HttpStatus.CREATED)
  subscribeCustomer(
    @Param('targetUserId') targetUserId: string,
    @Body() dto: CreateMembershipDto,
    @Request() req,
  ) {
    return this.agentsService.subscribeCustomer(req.user.id, targetUserId, dto);
  }

  // ─── Wallet Top-Up ───────────────────────────────────────────────────────────

  /**
   * POST /agents/wallet-topup
   * Credits cash to a customer's wallet.
   * Records the agentId in the transaction description for audit trail.
   */
  @Post('wallet-topup')
  @ApiOperation({
    summary: "Credit cash to a customer's wallet on behalf of the agent",
  })
  @ApiCreatedResponse({
    description: 'Updated wallet balance and transaction record',
  })
  @HttpCode(HttpStatus.CREATED)
  walletTopup(@Request() req, @Body() dto: AgentTopupDto) {
    return this.agentsService.walletTopup(req.user.id, dto);
  }

  // ─── Activity Log ─────────────────────────────────────────────────────────────

  /**
   * GET /agents/activity-log
   * Returns the 100 most recent activity log entries for the calling agent.
   */
  @Get('activity-log')
  @ApiOperation({ summary: 'Get activity log for the calling agent' })
  @ApiOkResponse({ description: 'List of recent agent actions' })
  getActivityLog(@Request() req) {
    return this.agentsService.getActivityLog(req.user.id);
  }
}
