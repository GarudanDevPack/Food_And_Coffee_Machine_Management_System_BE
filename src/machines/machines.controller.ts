import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
import { UpdateMachineDto, UpdateInventoryDto, UpdateCalibrationDto } from './dto/update-machine.dto';

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

  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client, RoleEnum.agent)
  @ApiQuery({ name: 'clientId', required: false })
  @ApiQuery({ name: 'agentId', required: false })
  findAll(@Query('clientId') clientId?: string, @Query('agentId') agentId?: string) {
    return this.machinesService.findAll(clientId, agentId);
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
  updateInventory(@Param('machineId') machineId: string, @Body() dto: UpdateInventoryDto) {
    return this.machinesService.updateInventory(machineId, dto);
  }

  @Patch(':machineId/calibration')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  updateCalibration(@Param('machineId') machineId: string, @Body() dto: UpdateCalibrationDto) {
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
}
