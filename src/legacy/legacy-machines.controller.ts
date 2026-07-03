/**
 * Legacy Machine endpoints — exact same paths as the old Express API.
 * Served without /api prefix. Visible in Swagger under "Legacy Machines" tag.
 *
 * GET /getmachinesitems?id=...       mobile: items on a machine
 * GET /getmachinelog?id=...          mobile/admin: machine details
 * GET /getvolumesizes?...            mobile: cup sizes for an item
 * GET /getallmachinelogs             admin: all machines
 * GET /getallmachinebyclient?...     admin: machines by client
 * PUT /updatemachinelog              admin: flush / sleep / update
 * PUT /updatemachinelogstatus        admin: online/offline status
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
import { ApiTags, ApiOperation, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { MachinesService } from '../machines/machines.service';

@ApiTags('Legacy Machines (No /api prefix)')
@Controller({ version: VERSION_NEUTRAL })
export class LegacyMachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Get('getmachinesitems')
  @ApiOperation({ summary: 'GET /getmachinesitems — items available on a machine' })
  @ApiQuery({ name: 'id', description: 'machineId (e.g. MCH-001)', required: true })
  async getMachineItems(@Query('id') id: string) {
    if (!id) throw new NotFoundException('Machine ID is required');
    const menu = await this.machinesService.getMachineMenu(id);
    return {
      success: true,
      message: 'Machine and items retrieved successfully',
      data: menu,
    };
  }

  @Get('getmachinelog')
  @ApiExcludeEndpoint()  // use GET /api/v1/getmachinelog instead (MachineQrController)
  async getMachineLog(@Query('id') id: string) {
    if (!id) throw new NotFoundException('Machine ID is required');
    const machine = await this.machinesService.findByMachineId(id);
    const m = machine as any;
    const machineStatus = !m.isOnline ? 'offline'
      : m.sleepMode ? 'sleep'
      : m.isBusy ? 'busy'
      : 'online';
    return {
      success: true,
      message: 'Machine retrieved successfully',
      data: { ...machine, machineStatus },
    };
  }

  @Get('getvolumesizes')
  @ApiOperation({ summary: 'GET /getvolumesizes — available cup sizes for an item on a machine' })
  @ApiQuery({ name: 'machine_id', required: true })
  @ApiQuery({ name: 'item_id', required: true })
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

    return {
      success: true,
      message: 'Volume sizes retrieved successfully',
      data: [...new Set(sizes)],
    };
  }

  @Get('getallmachinelogs')
  @ApiOperation({ summary: 'GET /getallmachinelogs — all machines (no filters)' })
  async getAllMachineLogs() {
    const machines = await this.machinesService.findAll();
    return {
      success: true,
      message: 'Machines retrieved successfully',
      data: machines,
    };
  }

  @Get('getallmachinebyclient')
  @ApiOperation({ summary: 'GET /getallmachinebyclient — machines filtered by client' })
  @ApiQuery({ name: 'client_id', required: false })
  async getAllMachinesByClient(@Query('client_id') clientId: string) {
    const machines = await this.machinesService.findAll(clientId);
    return {
      success: true,
      message: 'Machines retrieved successfully',
      data: machines,
    };
  }

  @Put('updatemachinelog')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PUT /updatemachinelog — trigger flush / toggle sleep / update fields' })
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

  @Put('updatemachinelogstatus')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'PUT /updatemachinelogstatus — mark machine online or offline' })
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
