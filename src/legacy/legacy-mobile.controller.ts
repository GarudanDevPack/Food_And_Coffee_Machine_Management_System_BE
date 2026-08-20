/**
 * Mobile-app QR compatibility endpoint.
 *
 * QR codes encode a URL like: /api/v1/getmachinelog?id=<machineId>
 *
 * Served at GET /api/v1/getmachinelog?id=<machineId>
 * 'getmachinelog' was removed from the main.ts exclude list so this controller
 * correctly receives the global /api prefix and version '1' → /api/v1/getmachinelog.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MachinesService } from '../machines/machines.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrdersService } from '../orders/orders.service';

@ApiTags('QR / Mobile (Legacy v1)')
@Controller({ version: '1' })
export class LegacyMobileController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly usersService: UsersService,
    private readonly orgsService: OrganizationsService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * POST /api/v1/createorder — mobile app order creation
   */
  @Post('createorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'POST /api/v1/createorder — mobile app creates order',
  })
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
            status: 'pending',
          },
        ],
        total_qty: 1,
        items_count: 1,
        price: 180.0,
        currency: 'LKR',
        status: 'pending',
        payment_status: 'paid',
      },
    },
  })
  createOrder(@Body() body: any) {
    return this.ordersService.legacyPlaceOrder(body);
  }

  @Get('getmachinelog')
  @ApiOperation({
    summary:
      'GET /api/v1/getmachinelog — QR scan: get machine details in old mobile format',
  })
  @ApiQuery({
    name: 'id',
    description: 'machineId (e.g. MCH-001)',
    required: true,
  })
  async getMachineLog(@Query('id') id: string) {
    if (!id) throw new BadRequestException('Machine ID is required');

    const machine = await this.machinesService.findByMachineId(id);
    if (!machine) throw new NotFoundException('Machine not found');

    const m = machine as any;

    // ── Client (user) lookup ──────────────────────────────────────────────────
    let clientData: { id: string; name: string } | null = null;
    if (m.clientId) {
      try {
        const user = await this.usersService.findById(m.clientId);
        if (user) {
          clientData = {
            id: String(user.id),
            name:
              [user.firstName, user.lastName].filter(Boolean).join(' ') ||
              (user as any).email ||
              '',
          };
        }
      } catch {
        // non-fatal
      }
    }

    // ── Organization lookup ───────────────────────────────────────────────────
    let orgData: { id: string; name: string } | null = null;
    if (m.orgId) {
      try {
        const org = await this.orgsService.findByOrgRef(m.orgId);
        if (org) {
          orgData = {
            id: (org as any).orgId || String((org as any)._id),
            name: org.name,
          };
        }
      } catch {
        // non-fatal
      }
    }

    // ── Inventory — branch on machineType ────────────────────────────────────
    const inventory =
      m.machineType === 'food'
        ? (m.batches ?? []).map((b: any) => ({
            item_id: b.itemId,
            packetofstock: b.totalQty ?? 0,
            stock: b.quantity ?? 0,
            cupcount: 0,
            qty: b.quantity ?? 0,
            nozzle: b.nozzleId ?? 1,
            _id: String(b._id ?? b.batchId ?? ''),
          }))
        : (m.inventory ?? []).map((inv: any) => ({
            item_id: inv.itemId,
            packetofstock: 0,
            stock: inv.currentStock ?? 0,
            cupcount: inv.cupcount ?? 0,
            qty: inv.minStock ?? 0,
            nozzle: inv.nozzle ?? 1,
            _id: String(inv._id ?? ''),
          }));

    const itemIds =
      m.machineType === 'food'
        ? [...new Set((m.batches ?? []).map((b: any) => b.itemId as string))]
        : (m.itemIds ?? []);

    const machineStatus = !m.isOnline
      ? 'offline'
      : m.sleepMode
        ? 'sleep'
        : m.isBusy
          ? 'busy'
          : 'online';

    return {
      success: true,
      message: 'Machine retrieved successfully',
      data: {
        id: m.machineId,
        name: m.name,
        client_id: clientData,
        org_id: orgData,
        sensor: m.sensor ?? { temp: null, water: null, powderlevel: [] },
        item_id: itemIds,
        status: machineStatus,
        machineStatus,
        last_maintenance: m.lastMaintenance ?? null,
        expire_at: m.expireAt ?? null,
        sleep_mode: m.sleepMode ?? false,
        flush_mode: m.flushMode ?? false,
        config_mode: false,
        inventory,
        qr_id: m.qrId ?? m.machineId,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        error: m.error ?? null,
      },
    };
  }
}
