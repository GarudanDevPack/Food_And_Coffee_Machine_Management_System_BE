import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../roles/roles.guard';
import { Roles } from '../roles/roles.decorator';
import { RoleEnum } from '../roles/roles.enum';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@ApiTags('Memberships')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'memberships', version: '1' })
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Subscribe to a membership plan.
   * - Customer: subscribes themselves (body: { plan })
   * - Agent: subscribes a customer on their behalf (body: { plan, targetUserId })
   */
  @Post('subscribe')
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.customer,
    RoleEnum.agent,
  )
  @HttpCode(HttpStatus.CREATED)
  subscribe(@Request() req, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.subscribe(
      req.user.id,
      req.user.role.id,
      dto,
    );
  }

  /** Customer views their latest membership */
  @Get('my')
  @Roles(RoleEnum.customer)
  getMyMembership(@Request() req) {
    return this.membershipsService.getMyMembership(req.user.id);
  }

  /** Admin/Agent lists all memberships. Agent can filter by userId. */
  @Get()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @ApiQuery({ name: 'userId', required: false })
  getAll(@Query('userId') userId?: string) {
    return this.membershipsService.getAll(userId);
  }

  /** Cancel a membership — admin, agent, or the owning customer */
  @Patch(':id/cancel')
  @Roles(
    RoleEnum.super_admin,
    RoleEnum.admin,
    RoleEnum.agent,
    RoleEnum.customer,
  )
  cancel(@Param('id') id: string, @Request() req) {
    return this.membershipsService.cancelMembership(
      id,
      req.user.id,
      req.user.role.id,
    );
  }
}
