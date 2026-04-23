/**
 * Legacy Machine endpoints — exact same paths as the old Express API.
 * Used by admin panel and mobile app. No /api prefix, no versioning, no auth guards.
 *
 * Old routes (public — no verifyToken):
 *   GET /getmachinesitems   mobile: get items available on a machine by id
 *   GET /getmachinelog      mobile/admin: get machine status/details by id
 *   GET /getvolumesizes     mobile: get cup size names for a machine item
 *
 * Old routes (verifyToken + verifyRole("client")):
 *   GET /getallmachinelogs          admin: get all machines
 *   GET /getallmachinebyclient      admin: get machines by client
 *   PUT /updatemachinelog           admin: trigger flush, sleep, or update fields
 *   PUT /updatemachinelogstatus     admin: mark machine online/offline
 */

import {
  Controller,
  Get,
  Put,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  VERSION_NEUTRAL,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MachinesService } from '../machines/machines.service';

@ApiExcludeController()
@Controller({ version: VERSION_NEUTRAL })
export class LegacyMachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  /**
   * GET /getmachinesitems?id=MCH-001
   * Mobile app: get all items available on a machine with stock and calibration.
   * Old backend: getMachineMobile() — returns Items array from machine.item_id.
   * New backend: getMachineMenu() — returns same data plus cupSizes and stock.
   */
  @Get('getmachinesitems')
  async getMachineItems(@Query('id') id: string) {
    if (!id) throw new NotFoundException('Machine ID is required');
    const menu = await this.machinesService.getMachineMenu(id);
    return {
      success: true,
      message: 'Machine and items retrieved successfully',
      data: menu,
    };
  }

  /**
   * GET /getmachinelog?id=MCH-001
   * Mobile app / admin panel: get machine details and status.
   * Old backend: getMachine() — finds by machine id field, returns full document.
   */
  @Get('getmachinelog')
  async getMachineLog(@Query('id') id: string) {
    if (!id) throw new NotFoundException('Machine ID is required');
    const machine = await this.machinesService.findByMachineId(id);
    return {
      success: true,
      message: 'Machine retrieved successfully',
      data: machine,
    };
  }

  /**
   * GET /getvolumesizes?machine_id=MCH-001&item_id=ITEM-001
   * Mobile app: get available cup size names for an item on a machine.
   * Old backend: getVolumeSizes() — queries Volume model for size names.
   * New backend: sizes are embedded in machine.calibration[].cupSize.
   */
  @Get('getvolumesizes')
  async getVolumeSizes(
    @Query('machine_id') machineId: string,
    @Query('item_id') itemId: string,
  ) {
    if (!machineId || !itemId) {
      throw new NotFoundException('machine_id and item_id are required');
    }
    const machine = await this.machinesService.findByMachineId(machineId);
    const calibration = (machine as any).calibration as {
      itemId: string;
      cupSize: string;
      timerOfPowder: number;
      timerOfWater: number;
    }[];

    const sizes = calibration
      .filter((c) => c.itemId === itemId && c.cupSize)
      .map((c) => c.cupSize);

    const uniqueSizes = [...new Set(sizes)];

    return {
      success: true,
      message: 'Volume sizes retrieved successfully',
      data: uniqueSizes,
    };
  }

  /**
   * GET /getallmachinelogs
   * Admin panel: get all machines.
   * Old backend: getAllMachines() — returns all MachineLog documents.
   */
  @Get('getallmachinelogs')
  async getAllMachineLogs() {
    const machines = await this.machinesService.findAll();
    return {
      success: true,
      message: 'Machines retrieved successfully',
      data: machines,
    };
  }

  /**
   * GET /getallmachinebyclient?client_id=CL-001
   * Admin panel: get machines for a specific client.
   * Old backend: getAllMachinesByClient() — filters by client_id.
   */
  @Get('getallmachinebyclient')
  async getAllMachinesByClient(@Query('client_id') clientId: string) {
    const machines = await this.machinesService.findAll(clientId);
    return {
      success: true,
      message: 'Machines retrieved successfully',
      data: machines,
    };
  }

  /**
   * PUT /updatemachinelog
   * Admin panel: trigger flush, toggle sleep mode, or update machine fields.
   * Old backend: updateMachine() — sets fields in DB then publishes MQTT command.
   *
   * flush_mode: true  → triggerManualFlush → publishes { flush:'true', sleep:'false', configMode:'false' }
   * sleep_mode: bool  → setSleepMode → publishes sleep or wake MQTT command
   *
   * Returns: { success, message, data: { modifiedCount: 1 } }  (matches old backend format)
   */
  @Put('updatemachinelog')
  @HttpCode(HttpStatus.OK)
  async updateMachineLog(@Body() body: any) {
    const { id, flush_mode, sleep_mode } = body;
    if (!id) throw new BadRequestException('Machine ID is required');

    if (flush_mode === true) {
      try {
        await this.machinesService.triggerManualFlush(id, 'daily');
      } catch (err) {
        return {
          success: false,
          message: (err as Error).message,
          data: { modifiedCount: 0 },
        };
      }
    }

    if (sleep_mode !== undefined) {
      await this.machinesService.setSleepMode(id, sleep_mode as boolean);
    }

    return {
      success: true,
      message: 'Machine updated successfully',
      data: { modifiedCount: 1 },
    };
  }

  /**
   * PUT /updatemachinelogstatus
   * Admin panel: mark machine online or offline.
   * Old backend: updateMachineStatus() — updates status + error fields in DB.
   * New backend maps `isOnline` field to the machine document.
   */
  @Put('updatemachinelogstatus')
  @HttpCode(HttpStatus.OK)
  async updateMachineLogStatus(@Body() body: any) {
    const { id, isOnline } = body;
    if (!id) throw new BadRequestException('Machine ID is required');
    await this.machinesService.setOnlineStatus(id, isOnline ?? true);
    return {
      success: true,
      message: 'Machine status updated successfully',
      data: { modifiedCount: 1 },
    };
  }
}
