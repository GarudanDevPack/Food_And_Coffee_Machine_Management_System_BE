import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { Outlet, OutletDocument } from './schemas/outlet.schema';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { MachinesService } from '../machines/machines.service';
import { ItemsService } from '../items/items.service';
import { RoleEnum } from '../roles/roles.enum';

@Injectable()
export class OutletsService {
  constructor(
    @InjectModel(Outlet.name) private readonly outletModel: Model<OutletDocument>,
    private readonly machinesService: MachinesService,
    private readonly itemsService: ItemsService,
  ) {}

  // ─── Agent CRUD ────────────────────────────────────────────────────────────

  async create(agentId: string, dto: CreateOutletDto): Promise<Outlet> {
    // Verify all machines exist and belong to this agent
    for (const machineId of dto.machineIds) {
      const machine = await this.machinesService.findByMachineId(machineId);
      if (machine.agentId && machine.agentId !== agentId) {
        throw new ForbiddenException(
          `Machine ${machineId} is assigned to a different agent`,
        );
      }
    }

    const outletId = this.generateOutletId();
    const qrToken = crypto.randomBytes(24).toString('hex'); // 48-char unique token

    return this.outletModel.create({
      outletId,
      agentId,
      qrToken,
      ...dto,
    });
  }

  /** Returns all outlets. Admins see all; agents see only their own. */
  async findAll(callerRole: RoleEnum, callerId: string): Promise<Outlet[]> {
    if (
      callerRole === RoleEnum.super_admin ||
      callerRole === RoleEnum.admin ||
      callerRole === RoleEnum.client
    ) {
      return this.outletModel.find().sort({ createdAt: -1 }).exec();
    }
    // agent — own outlets only
    return this.outletModel
      .find({ agentId: callerId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Outlet> {
    const outlet = await this.outletModel.findById(id).exec();
    if (!outlet) throw new NotFoundException(`Outlet ${id} not found`);
    return outlet;
  }

  async update(
    id: string,
    callerId: string,
    callerRole: RoleEnum,
    dto: UpdateOutletDto,
  ): Promise<Outlet> {
    const outlet = await this.findOne(id);
    this.assertOwnerOrAdmin(outlet, callerId, callerRole);

    Object.assign(outlet, dto);
    return (outlet as OutletDocument).save();
  }

  async remove(id: string, callerId: string, callerRole: RoleEnum): Promise<void> {
    const outlet = await this.findOne(id);
    this.assertOwnerOrAdmin(outlet, callerId, callerRole);
    await this.outletModel.findByIdAndDelete(id).exec();
  }

  // ─── QR Code ────────────────────────────────────────────────────────────────

  /**
   * Returns a PNG QR code buffer for the outlet.
   * Encodes the qrToken; front-end or the scanner reads it and calls
   * GET /outlets/scan/:qrToken.
   */
  async generateQrCode(
    id: string,
    callerId: string,
    callerRole: RoleEnum,
  ): Promise<Buffer> {
    const outlet = await this.findOne(id);
    this.assertOwnerOrAdmin(outlet, callerId, callerRole);

    // Encode the raw qrToken — the frontend constructs the full URL
    return QRCode.toBuffer(outlet.qrToken, {
      type: 'png',
      width: 300,
      margin: 2,
    });
  }

  // ─── Public Scan Endpoint ──────────────────────────────────────────────────

  /**
   * Called when a customer scans the outlet QR code.
   * Returns:
   *   - outlet info (name, location)
   *   - machines in the outlet (id, status, isOnline)
   *   - all available items (isAvailable: true) with cup sizes + prices
   *   - per-item stock availability across outlet machines
   */
  async scanQr(qrToken: string): Promise<{
    outlet: {
      outletId: string;
      name: string;
      location?: string;
    };
    machines: {
      machineId: string;
      name: string;
      status: string;
      isOnline: boolean;
    }[];
    items: {
      itemId: string;
      name: string;
      description?: string;
      category?: string;
      imageUrl?: string;
      cupSizes: { size: string; price: number }[];
      bayesianRating: number;
      availableOnMachines: string[];
    }[];
  }> {
    const outlet = await this.outletModel.findOne({ qrToken, isActive: true }).exec();
    if (!outlet) {
      throw new NotFoundException('Invalid or inactive QR code');
    }

    // Fetch machines
    const machines = await Promise.all(
      outlet.machineIds.map((mid) =>
        this.machinesService.findByMachineId(mid).catch(() => null),
      ),
    );
    const activeMachines = machines.filter(
      (m): m is NonNullable<typeof m> => m !== null && m.status === 'active',
    );

    // Build itemId → which machines have it in stock
    const itemStockMap = new Map<string, string[]>();
    for (const machine of activeMachines) {
      for (const inv of (machine as any).inventory ?? []) {
        if (inv.currentStock > 0) {
          const existing = itemStockMap.get(inv.itemId) ?? [];
          existing.push((machine as any).machineId);
          itemStockMap.set(inv.itemId, existing);
        }
      }
    }

    // Fetch item details for all in-stock items
    const itemDetails = await Promise.all(
      Array.from(itemStockMap.keys()).map((itemId) =>
        this.itemsService.findOne(itemId).catch(() => null),
      ),
    );

    const items = itemDetails
      .filter((item): item is NonNullable<typeof item> => item !== null && item.isAvailable)
      .map((item) => ({
        itemId: (item as any)._id?.toString() ?? (item as any).id,
        name: item.name,
        description: item.description,
        category: item.category,
        imageUrl: item.imageUrl,
        cupSizes: item.cupSizes.map((cs) => ({ size: cs.size, price: cs.price })),
        bayesianRating: item.bayesianRating,
        availableOnMachines: itemStockMap.get((item as any)._id?.toString() ?? (item as any).id) ?? [],
      }));

    return {
      outlet: {
        outletId: outlet.outletId,
        name: outlet.name,
        location: outlet.location,
      },
      machines: activeMachines.map((m: any) => ({
        machineId: m.machineId,
        name: m.name,
        status: m.status,
        isOnline: m.isOnline,
      })),
      items,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Verify caller is the outlet owner OR an admin/super_admin */
  private assertOwnerOrAdmin(
    outlet: Outlet,
    callerId: string,
    callerRole: RoleEnum,
  ): void {
    const isAdmin =
      callerRole === RoleEnum.super_admin || callerRole === RoleEnum.admin;
    if (!isAdmin && outlet.agentId !== callerId) {
      throw new ForbiddenException('You do not have access to this outlet');
    }
  }

  private generateOutletId(): string {
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `OUTLET_${rand}`;
  }
}
