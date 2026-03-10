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
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

@ApiTags('Items')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller({ path: 'items', version: '1' })
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateItemDto) {
    return this.itemsService.create(dto);
  }

  @Get()
  @ApiQuery({ name: 'category', required: false })
  findAll(@Query('category') category?: string) {
    return this.itemsService.findAll(category);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.client)
  update(@Param('id') id: string, @Body() dto: Partial<CreateItemDto>) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(RoleEnum.super_admin, RoleEnum.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.itemsService.remove(id);
  }

  @Post('ratings')
  @Roles(RoleEnum.customer)
  @HttpCode(HttpStatus.CREATED)
  addRating(@Request() req, @Body() dto: CreateRatingDto) {
    return this.itemsService.addRating(req.user.id, dto);
  }

  @Get(':itemId/ratings')
  getRatings(@Param('itemId') itemId: string) {
    return this.itemsService.getRatings(itemId);
  }
}
