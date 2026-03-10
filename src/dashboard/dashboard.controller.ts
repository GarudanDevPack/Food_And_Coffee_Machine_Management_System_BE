import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiQuery({ name: 'clientId', required: false })
  getSummary(@Query('clientId') clientId?: string) {
    return this.dashboardService.getSummary(clientId);
  }

  @Get('orders-over-time')
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'machineId', required: false })
  getOrdersOverTime(
    @Query('days') days?: string,
    @Query('machineId') machineId?: string,
  ) {
    return this.dashboardService.getOrdersOverTime(days ? parseInt(days) : 30, machineId);
  }

  @Get('top-items')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTopItems(@Query('limit') limit?: string) {
    return this.dashboardService.getTopItems(limit ? parseInt(limit) : 10);
  }

  @Get('machine-performance')
  @ApiQuery({ name: 'clientId', required: false })
  getMachinePerformance(@Query('clientId') clientId?: string) {
    return this.dashboardService.getMachinePerformance(clientId);
  }

  @Get('revenue-by-machine')
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getRevenueByMachine(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.dashboardService.getRevenueByMachine(startDate, endDate);
  }
}
