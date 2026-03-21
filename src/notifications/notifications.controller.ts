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
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(
      dto.userId,
      dto.title,
      dto.message,
      dto.type,
      dto.referenceId,
    );
  }

  @Get()
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(@Request() req, @Query('unreadOnly') unreadOnly?: string) {
    return this.notificationsService.findAll(
      req.user.id,
      unreadOnly === 'true',
    );
  }

  @Get('unread-count')
  getUnreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markRead(id, req.user.id);
  }

  @Patch('read-all')
  markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }
}
