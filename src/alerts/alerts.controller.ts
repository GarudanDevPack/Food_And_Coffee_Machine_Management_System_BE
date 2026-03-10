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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@ApiTags('Alerts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'alerts', version: '1' })
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAlertDto) {
    return this.alertsService.create(dto);
  }

  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client, RoleEnum.agent)
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'resolved', required: false, type: Boolean })
  findAll(@Query('machineId') machineId?: string, @Query('resolved') resolved?: string) {
    return this.alertsService.findAll(machineId, resolved);
  }

  @Get(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client, RoleEnum.agent)
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/resolve')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  resolve(@Param('id') id: string, @Request() req) {
    return this.alertsService.resolve(id, req.user.id);
  }

  @Delete(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.alertsService.remove(id);
  }
}
