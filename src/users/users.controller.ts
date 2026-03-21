import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  SerializeOptions,
  UseInterceptors,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RoleEnum } from '../roles/roles.enum';
import { JwtAuth } from '../auth/guards/jwt-auth.guard';

import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { NullableType } from '../utils/types/nullable.type';
import { QueryUserDto } from './dto/query-user.dto';
import { User } from './domain/user';
import { UsersService } from './users.service';
import { infinityPagination } from '../utils/infinity-pagination';

/**
 * Users management endpoints.
 *
 * POST /users  — create customer: allowed for super_admin, admin, agent
 * All other endpoints — super_admin and admin only.
 */
@ApiTags('Users')
@UseInterceptors(ClassSerializerInterceptor)
@Controller({
  path: 'users',
  version: '1',
})
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Create a new customer account.
   * Agents are allowed to create customers on behalf of the business.
   * Auto-generates: CUS-YYYYMMDD-HHMMSS ID + wallet (wlt_<ts36>_<rand8>).
   */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin, RoleEnum.agent)
  @ApiCreatedResponse({ type: User })
  @SerializeOptions({ groups: ['admin'] })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProfileDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createProfileDto);
  }

  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOkResponse({ type: InfinityPaginationResponse(User) })
  @SerializeOptions({ groups: ['admin'] })
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryUserDto,
  ): Promise<InfinityPaginationResponseDto<User>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.usersService.findManyWithPagination({
        filterOptions: query?.filters,
        sortOptions: query?.sort,
        paginationOptions: { page, limit },
      }),
      { page, limit },
    );
  }

  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOkResponse({ type: User })
  @SerializeOptions({ groups: ['admin'] })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, required: true })
  findOne(@Param('id') id: User['id']): Promise<NullableType<User>> {
    return this.usersService.findById(id);
  }

  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOkResponse({ type: User })
  @SerializeOptions({ groups: ['admin'] })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, required: true })
  update(
    @Param('id') id: User['id'],
    @Body() updateProfileDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.usersService.update(id, updateProfileDto);
  }

  /**
   * Approve a pending agent account.
   *
   * Sets the agent's status from inactive → active so they can log in.
   * Only super_admin and admin can approve agents.
   *
   * @throws NotFoundException           if the user does not exist
   * @throws UnprocessableEntityException if the user is not an agent or already active
   */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @ApiOkResponse({ type: User, description: 'Agent account activated' })
  @SerializeOptions({ groups: ['admin'] })
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
    description: 'MongoDB _id of the pending agent',
  })
  approveAgent(@Param('id') id: User['id']): Promise<User> {
    return this.usersService.approveAgent(id);
  }

  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @Delete(':id')
  @ApiParam({ name: 'id', type: String, required: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: User['id']): Promise<void> {
    return this.usersService.remove(id);
  }
}
