import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import {
  UpdateMachineDto,
  UpdateInventoryDto,
  UpdateCalibrationDto,
} from './dto/update-machine.dto';
import { LoadBatchDto } from './dto/load-batch.dto';

@ApiTags('Machines')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'machines', version: '1' })
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateMachineDto) {
    return this.machinesService.create(dto);
  }

  /** Agent shortcut: get only the machines assigned to the calling agent */
  @Get('my')
  @Roles(RoleEnum.agent)
  getMyMachines(@Request() req) {
    return this.machinesService.findAll(undefined, req.user.id);
  }

  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client, RoleEnum.agent)
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'agentId', required: false })
  @ApiQuery({ name: 'orgId', required: false })
  findAll(
    @Query('clientId') clientId?: string,
    @Query('agentId') agentId?: string,
    @Query('orgId') orgId?: string,
  ) {
    return this.machinesService.findAll(clientId, agentId, orgId);
  }

  @Get(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client, RoleEnum.agent)
  findOne(@Param('id') id: string) {
    return this.machinesService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  update(@Param('id') id: string, @Body() dto: UpdateMachineDto) {
    return this.machinesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.machinesService.remove(id);
  }

  @Patch(':machineId/inventory')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  updateInventory(
    @Param('machineId') machineId: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.machinesService.updateInventory(machineId, dto);
  }

  @Patch(':machineId/calibration')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  updateCalibration(
    @Param('machineId') machineId: string,
    @Body() dto: UpdateCalibrationDto,
  ) {
    return this.machinesService.updateCalibration(machineId, dto);
  }

  @Post(':machineId/flush')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @ApiQuery({ name: 'type', enum: ['daily', 'weekly'], required: false })
  triggerFlush(
    @Param('machineId') machineId: string,
    @Query('type') type: 'daily' | 'weekly' = 'daily',
  ) {
    return this.machinesService.triggerManualFlush(machineId, type);
  }

  // ─── Food Batch Endpoints ────────────────────────────────────────────────────

  @Post(':machineId/batches')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @HttpCode(HttpStatus.CREATED)
  loadBatch(
    @Param('machineId') machineId: string,
    @Request() req,
    @Body() dto: LoadBatchDto,
  ) {
    return this.machinesService.loadBatch(machineId, req.user.id, dto);
  }

  @Get(':machineId/near-expiry-items')
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.client,
    RoleEnum.agent,
    RoleEnum.customer,
  )
  @ApiQuery({
    name: 'hours',
    required: false,
    description: 'Expiry threshold in hours (default 24)',
  })
  getNearExpiryItems(
    @Param('machineId') machineId: string,
    @Query('hours') hours?: string,
  ) {
    return this.machinesService.getNearExpiryItems(
      machineId,
      hours ? Number(hours) : 24,
    );
  }

  @Get(':machineId/batches')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'expired', 'depleted'],
  })
  getBatches(
    @Param('machineId') machineId: string,
    @Query('status') status?: string,
  ) {
    return this.machinesService.getBatches(machineId, status);
  }

  @Delete(':machineId/batches/:batchId')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBatch(
    @Param('machineId') machineId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.machinesService.removeBatch(machineId, batchId);
  }

  // ─── Item Assignment Endpoints ───────────────────────────────────────────────

  @Post(':machineId/items')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.CREATED)
  assignItem(
    @Param('machineId') machineId: string,
    @Body('itemId') itemId: string,
  ) {
    return this.machinesService.assignItem(machineId, itemId);
  }

  @Delete(':machineId/items/:itemId')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeItem(
    @Param('machineId') machineId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.machinesService.removeItem(machineId, itemId);
  }

  // ─── Sleep / Wake Endpoints ──────────────────────────────────────────────────

  @Post(':machineId/sleep')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  sleep(@Param('machineId') machineId: string) {
    return this.machinesService.setSleepMode(machineId, true);
  }

  @Post(':machineId/wake')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  wake(@Param('machineId') machineId: string) {
    return this.machinesService.setSleepMode(machineId, false);
  }
}
