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
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

@ApiTags('Reservations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'reservations', version: '1' })
export class ReservationsController {
  constructor(private readonly svc: ReservationsService) {}

  /** Customer creates a reservation */
  @Post()
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.agent,
    RoleEnum.customer,
  )
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateReservationDto, @Request() req) {
    return this.svc.create(dto, req.user.id);
  }

  /** Customer: my reservations */
  @Get('my')
  @Roles(RoleEnum.customer, RoleEnum.agent)
  myReservations(@Request() req) {
    return this.svc.myReservations(req.user.id);
  }

  /** Admin / Agent: all reservations with optional filters */
  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent, RoleEnum.client)
  @ApiQuery({ name: 'machineId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'date', required: false })
  findAll(
    @Query('machineId') machineId?: string,
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.svc.findAll({ machineId, status, date });
  }

  @Get(':id')
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.agent,
    RoleEnum.client,
    RoleEnum.customer,
  )
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  /** Admin/Agent confirms */
  @Patch(':id/confirm')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  confirm(@Param('id') id: string) {
    return this.svc.confirm(id);
  }

  /** Admin/Agent marks completed */
  @Patch(':id/complete')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  complete(@Param('id') id: string) {
    return this.svc.complete(id);
  }

  /** Customer cancels their own, admin can cancel any */
  @Patch(':id/cancel')
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.agent,
    RoleEnum.customer,
  )
  cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    const isAdmin = [
      RoleEnum.super_admin,
      RoleEnum.admin,
      RoleEnum.agent,
    ].includes(req.user.role?.id);
    return this.svc.cancel(id, req.user.id, reason, isAdmin);
  }

  @Delete(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
