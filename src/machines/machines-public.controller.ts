import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MachinesService } from './machines.service';

/**
 * Public endpoints — no JWT required.
 * Used by mobile app after scanning a machine QR code.
 */
@ApiTags('Machines (Public)')
@Controller({ path: 'machines', version: '1' })
export class MachinesPublicController {
  constructor(private readonly machinesService: MachinesService) {}

  /**
   * Returns items available on the machine with stock status, prices,
   * and machine-specific calibration timers.
   * Equivalent to old getMachineMobile() from Express backend.
   */
  @Get(':machineId/menu')
  @ApiOperation({ summary: 'Public: get items available on this machine' })
  getMachineMenu(@Param('machineId') machineId: string) {
    return this.machinesService.getMachineMenu(machineId);
  }
}
