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
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from '../orders/orders.service';

@ApiTags('Legacy (Mobile / Hardware)')
@Controller({ version: VERSION_NEUTRAL })
export class LegacyOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /createorder
   * Body (mobile app format): { client, org, user: { id }, machine_id, items: [{item_id, item_name, vol, qty, nozzle}], price, currency? }
   */
  @Post('createorder')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      example: {
        client: { id: 1, name: 'QFOX Client' },
        org: { id: 1, name: 'QFOX Colombo Hub' },
        user: { id: '6a168654dc5e7b7504bbc4dd', name: 'John' },
        machine_id: 'cm_mn420njq_01vtxhuc',
        items: [
          {
            item_id: '69bc282675011b08dcfcbfda',
            item_name: 'Cappuccino',
            nozzle: '',
            qty: 1,
            remaining_qty: 1,
            vol: '120ml',
          },
        ],
        total_qty: 1,
        items_count: 1,
        price: 180.0,
        currency: 'LKR',
        payment_status: 'paid',
      },
    },
  })
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
  @ApiQuery({ name: 'machine_id', required: true })
  getLastOrderByMachine(@Query('machine_id') machineId: string) {
    return this.ordersService.getActiveOrderForMachine(machineId);
  }

  /**
   * GET /getorderbymachine?machine_id=
   * Same as getlastorderbymachine — alias used by older firmware.
   */
  @Get('getorderbymachine')
  @ApiQuery({ name: 'machine_id', required: true })
  getOrderByMachine(@Query('machine_id') machineId: string) {
    return this.ordersService.getActiveOrderForMachine(machineId);
  }

  /**
   * GET /getorderbyuser?machine_id=&user_id=
   * User checks their current active order on a specific machine.
   */
  @Get('getorderbyuser')
  @ApiQuery({ name: 'machine_id', required: true })
  @ApiQuery({ name: 'user_id', required: true })
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
