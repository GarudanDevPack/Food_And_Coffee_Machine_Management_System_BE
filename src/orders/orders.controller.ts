import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuth } from '../auth/guards/jwt-auth.guard';
import { RoleEnum } from '../roles/roles.enum';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Orders')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ─── Customer ─────────────────────────────────────────────────────────────

  /**
   * Place a new order.
   * - Customer: places for themselves (no targetUserId needed)
   * - Agent: must include targetUserId in body to place on behalf of a customer
   */
  @JwtAuth(RoleEnum.customer, RoleEnum.agent)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  placeOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.ordersService.placeOrder(req.user.id, req.user.role.id, dto);
  }

  /** Get my own order history */
  @JwtAuth(RoleEnum.customer)
  @Get('me')
  getMyOrders(@Request() req) {
    return this.ordersService.findMyOrders(req.user.id);
  }

  // ─── Admin / Agent / Client ────────────────────────────────────────────────

  /** List all orders — admins see all; agents can filter by machineId/agentId */
  @JwtAuth(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.client,
    RoleEnum.agent,
  )
  @Get()
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'agentId', required: false })
  findAll(
    @Query('userId') userId?: string,
    @Query('machineId') machineId?: string,
    @Query('status') status?: string,
    @Query('agentId') agentId?: string,
  ) {
    return this.ordersService.findAll(userId, machineId, status, agentId);
  }

  @JwtAuth(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.client,
    RoleEnum.agent,
  )
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  /**
   * Mark an order as completed.
   * Agent: can only complete orders for machines assigned to them.
   * Admin/SuperAdmin: can complete any order.
   */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @Patch(':id/complete')
  completeOrder(@Param('id') id: string, @Request() req) {
    return this.ordersService.completeOrder(id, req.user.id, req.user.role.id);
  }

  /**
   * Mark an order as failed (triggers wallet refund if dispensing).
   * Same ownership rules as completeOrder.
   */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @Patch(':id/fail')
  failOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    return this.ordersService.failOrder(
      id,
      reason,
      req.user.id,
      req.user.role.id,
    );
  }

  /** Refund an order (admin only) */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @Patch(':id/refund')
  refundOrder(@Param('id') id: string) {
    return this.ordersService.refundOrder(id);
  }
}
