/**
 * Legacy Orders endpoints — exact same paths as the old Express API.
 * Used by the mobile app and hardware machines.
 * No /api prefix, no versioning, no auth guards.
 *
 * Old routes:
 *   POST /createorder              mobile app creates order
 *   PUT  /updateorderbymachine     machine reports dispensing result
 *   GET  /getlastorderbymachine    machine polls for its next pending order
 *   GET  /getorderbymachine        alias for above (older firmware)
 *   GET  /getorderbyuser           user checks current order on a machine
 *   GET  /ordersbyuser             user's order history
 *   GET  /orderbyid                get order by string orderId (ETR-...)
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { OrdersService } from '../orders/orders.service';

@ApiExcludeController()
@Controller({ version: VERSION_NEUTRAL })
export class LegacyOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /createorder
   * Body: { user: { id }, machine_id, items: [{item_id, item_name, vol, qty, nozzle}], amount, currency? }
   */
  @Post('createorder')
  @HttpCode(HttpStatus.OK)
  createOrder(@Body() body: any) {
    return this.ordersService.legacyPlaceOrder(body);
  }

  /**
   * PUT /updateorderbymachine
   * Body: { id: "ETR-...", status: "completed"|"cancelled"|"processing", error? }
   */
  @Put('updateorderbymachine')
  @HttpCode(HttpStatus.OK)
  updateOrderByMachine(@Body() body: any) {
    return this.ordersService.machineUpdateOrder(
      body.id,
      body.status,
      body.error,
    );
  }

  /**
   * GET /getlastorderbymachine?machine_id=
   * Machine polls for its next pending/dispensing order.
   */
  @Get('getlastorderbymachine')
  getLastOrderByMachine(@Query('machine_id') machineId: string) {
    return this.ordersService.getActiveOrderForMachine(machineId);
  }

  /**
   * GET /getorderbymachine?machine_id=
   * Same as getlastorderbymachine — alias used by older firmware.
   */
  @Get('getorderbymachine')
  getOrderByMachine(@Query('machine_id') machineId: string) {
    return this.ordersService.getActiveOrderForMachine(machineId);
  }

  /**
   * GET /getorderbyuser?machine_id=&user_id=
   * User checks their current active order on a specific machine.
   */
  @Get('getorderbyuser')
  getOrderByUser(
    @Query('machine_id') machineId: string,
    @Query('user_id') userId: string,
  ) {
    return this.ordersService.getActiveOrderForUser(machineId, userId);
  }

  /**
   * GET /ordersbyuser?id=
   * User's order history (last 50 orders).
   */
  @Get('ordersbyuser')
  getOrdersByUser(@Query('id') userId: string) {
    return this.ordersService.findMyOrders(userId);
  }

  /**
   * GET /orderbyid?id=
   * Get a single order by its string orderId (ETR-YYYYMMDD_HHMMSS_XXXX).
   */
  @Get('orderbyid')
  getOrderById(@Query('id') id: string) {
    return this.ordersService.findByOrderStringId(id);
  }
}
