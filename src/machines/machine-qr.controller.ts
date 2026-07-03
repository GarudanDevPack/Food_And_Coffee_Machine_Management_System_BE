import {
  Controller,
  Get,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * Serves GET /api/v1/getmachinelog?id=<machineId>
 * Returns the machine document in the old mobile-app format that the Flutter
 * Machine.fromJson parser expects (snake_case fields, nested client_id / org_id).
 * Placed in MachinesModule so it inherits the proven version:'1' routing.
 */
@ApiTags('QR / Mobile (v1)')
@Controller({ path: 'getmachinelog', version: '1' })
export class MachineQrController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly usersService: UsersService,
    private readonly orgsService: OrganizationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'GET /api/v1/getmachinelog — QR scan: machine details in Flutter format' })
  @ApiQuery({ name: 'id', description: 'machineId (e.g. cm_mn420njq_01vtxhuc)', required: true })
  async getMachineLog(@Query('id') id: string) {
    if (!id) throw new BadRequestException('Machine ID is required');

    const machine = await this.machinesService.findByMachineId(id);
    if (!machine) throw new NotFoundException('Machine not found');

    const m = machine as any;

    // ── Client lookup ─────────────────────────────────────────────────────────
    let clientData: { id: string; name: string } | null = null;
    if (m.clientId) {
      try {
        const user = await this.usersService.findById(m.clientId);
        if (user) {
          clientData = {
            id: String(user.id),
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || (user as any).email || '',
          };
        }
      } catch { /* non-fatal */ }
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
      } catch { /* non-fatal */ }
    }

    // ── Inventory — coffee uses inventory[], food uses batches[] ──────────────
    const inventory =
      m.machineType === 'food'
        ? (m.batches ?? []).map((b: any) => ({
            item_id: String(b.itemId),
            packetofstock: b.totalQty ?? 0,
            stock: b.quantity ?? 0,
            cupcount: 0,
            qty: b.quantity ?? 0,
            nozzle: b.nozzleId ?? 1,
            _id: String(b._id ?? b.batchId ?? ''),
          }))
        : (m.inventory ?? []).map((inv: any) => ({
            item_id: String(inv.itemId),   // ObjectId → string
            packetofstock: 0,
            stock: inv.currentStock ?? 0,
            cupcount: inv.cupcount ?? 0,
            qty: inv.minStock ?? 0,
            nozzle: inv.nozzle ?? 1,
            _id: String(inv._id ?? ''),
          }));

    // Derive item_id list from inventory/batches (m.itemIds is often empty)
    const itemIds =
      m.machineType === 'food'
        ? [...new Set((m.batches ?? []).map((b: any) => String(b.itemId)))]
        : [...new Set((m.inventory ?? []).map((inv: any) => String(inv.itemId)).filter(Boolean))];

    return {
      success: true,
      message: 'Machine retrieved successfully',
      data: {
        id: m.machineId,
        name: m.name,
        client_id: clientData,
        org_id: orgData,
        sensor: {
          temp:        m.sensor?.temp  ?? null,
          water:       m.sensor?.water ?? null,
          powderlevel: m.sensor?.powderlevel ?? [],
        },
        item_id: itemIds,
        status: m.isOnline ? 'online' : 'offline',
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

/**
 * Serves GET /api/v1/getmachinesitems?id=<machineId>
 * Versioned equivalent of the legacy GET /getmachinesitems used by the devtunnel frontend.
 */
@ApiTags('QR / Mobile (v1)')
@Controller({ path: 'getmachinesitems', version: '1' })
export class MachineMenuController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get()
  @ApiOperation({ summary: 'GET /api/v1/getmachinesitems — items available on a machine' })
  @ApiQuery({ name: 'id', description: 'machineId (e.g. cm_mn420njq_01vtxhuc)', required: true })
  async getMachineItems(@Query('id') id: string) {
    if (!id) throw new NotFoundException('Machine ID is required');
    const menu = await this.machinesService.getMachineMenu(id);
    return {
      success: true,
      message: 'Machine and items retrieved successfully',
      data: menu,
    };
  }
}
