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
import { AdvertisementsService } from './advertisements.service';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';

@ApiTags('Advertisements')
@Controller({ path: 'advertisements', version: '1' })
export class AdvertisementsController {
  constructor(private readonly adsService: AdvertisementsService) {}

  // Public: get active ads for a machine (kiosk display)
  @Get('active')
  @ApiQuery({ name: 'machineId', required: false })
  getActive(@Query('machineId') machineId?: string) {
    return this.adsService.findActive(machineId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdvertisementDto) {
    return this.adsService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.adsService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  findOne(@Param('id') id: string) {
    return this.adsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAdvertisementDto>,
  ) {
    return this.adsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.adsService.remove(id);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  incrementView(@Param('id') id: string) {
    return this.adsService.incrementView(id);
  }
}
