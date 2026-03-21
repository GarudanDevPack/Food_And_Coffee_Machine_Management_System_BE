import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiQuery,
  ApiOperation,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AssignAgentDto } from './dto/assign-agent.dto';
import { AssignMachineDto } from './dto/assign-machine.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  // ─── Admin: Create Organization ─────────────────────────────────────────────

  @Post()
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Create a new organization (links a client user)',
  })
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgService.create(dto);
  }

  // ─── Admin: List All Organizations ─────────────────────────────────────────

  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: List all active organizations' })
  findAll() {
    return this.orgService.findAll();
  }

  // ─── Client: Get Own Organization ───────────────────────────────────────────

  @Get('mine')
  @Roles(RoleEnum.client)
  @ApiOperation({ summary: 'Client: Get own organization details' })
  getMyOrg(@Request() req) {
    return this.orgService.findByClientUserId(req.user.id);
  }

  // ─── Client: Dashboard (KPIs scoped to own machines) ───────────────────────

  @Get('mine/dashboard')
  @Roles(RoleEnum.client)
  @ApiOperation({
    summary: 'Client: KPI summary for own organization machines',
  })
  getMyDashboard(@Request() req) {
    return this.orgService.getDashboard(req.user.id);
  }

  // ─── Client: Revenue Report ─────────────────────────────────────────────────

  @Get('mine/revenue')
  @Roles(RoleEnum.client)
  @ApiQuery({
    name: 'month',
    required: false,
    example: '2026-03',
    description: 'Filter by month in YYYY-MM format. Omit for all-time.',
  })
  @ApiOperation({ summary: 'Client: Revenue report for own organization' })
  getMyRevenue(@Request() req, @Query('month') month?: string) {
    return this.orgService.getRevenueReport(req.user.id, month);
  }

  // ─── Admin: Get Org by ID ───────────────────────────────────────────────────

  @Get(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: Get organization by MongoDB _id' })
  findOne(@Param('id') id: string) {
    return this.orgService.findById(id);
  }

  // ─── Admin: Update Organization ─────────────────────────────────────────────

  @Patch(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: Update organization fields' })
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.orgService.update(id, dto);
  }

  // ─── Admin: Soft Delete Organization ───────────────────────────────────────

  @Delete(':id')
  @Roles(RoleEnum.super_admin)
  @ApiOperation({
    summary: 'Super Admin: Deactivate (soft-delete) organization',
  })
  softDelete(@Param('id') id: string) {
    return this.orgService.softDelete(id);
  }

  // ─── Admin: Assign Agent to Org ─────────────────────────────────────────────

  @Post(':id/agents')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Assign an agent to this organization' })
  assignAgent(@Param('id') id: string, @Body() dto: AssignAgentDto) {
    return this.orgService.assignAgent(id, dto.agentId);
  }

  // ─── Admin: Remove Agent from Org ───────────────────────────────────────────

  @Delete(':id/agents/:agentId')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: Remove an agent from this organization' })
  removeAgent(@Param('id') id: string, @Param('agentId') agentId: string) {
    return this.orgService.removeAgent(id, agentId);
  }

  // ─── Admin: Assign Machine to Org ──────────────────────────────────────────

  @Post(':id/machines')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Assign a machine to this organization' })
  assignMachine(@Param('id') id: string, @Body() dto: AssignMachineDto) {
    return this.orgService.assignMachine(id, dto.machineId);
  }

  // ─── Admin: Remove Machine from Org ────────────────────────────────────────

  @Delete(':id/machines/:machineId')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOperation({ summary: 'Admin: Remove a machine from this organization' })
  removeMachine(
    @Param('id') id: string,
    @Param('machineId') machineId: string,
  ) {
    return this.orgService.removeMachine(id, machineId);
  }
}
