/**
 * Legacy User endpoints — exact same paths as the old Express API.
 * Used by the mobile app. No /api prefix, no versioning.
 *
 * Old routes:
 *   GET    /users              admin: getAllUsers
 *   GET    /getuser            admin: getUser by body.id (customerId CUS-*)
 *   GET    /getuserbynumber    public: getUserByNumber via query.phone_number
 *   POST   /createuser         public: create customer (auto CUS-ID + wallet)
 *   PUT    /updateuser         authenticated: update user fields
 *   DELETE /deleteuser         authenticated: delete user by body.id (customerId)
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { RoleEnum } from '../roles/roles.enum';

// Normalize phone same as old system
function normalizePhone(phone: string): string {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return '+94' + digits.slice(1);
  if (digits.startsWith('94') && digits.length === 11) return '+' + digits;
  return phone;
}

@ApiTags('Legacy Users (Mobile App)')
@Controller({ version: VERSION_NEUTRAL })
export class LegacyUsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /users — all customers (admin) */
  @Get('users')
  async getAllUsers() {
    const users = await this.usersService.findManyWithPagination({
      filterOptions: { roles: [{ id: RoleEnum.customer }] },
      sortOptions: [{ orderBy: 'createdAt', order: 'DESC' }],
      paginationOptions: { page: 1, limit: 500 },
    });
    return {
      success: true,
      message: 'Users retrieved successfully',
      data: users,
    };
  }

  /** GET /getuser — get by customerId (body.id = CUS-*) */
  @Get('getuser')
  async getUser(@Body() body: { id: string }) {
    const user = await this.usersService.findByCustomerId(body.id);
    if (!user) throw new NotFoundException('User not found');
    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
    };
  }

  /** GET /getuserbynumber?phone_number=0771234567 */
  @Get('getuserbynumber')
  async getUserByNumber(@Query('phone_number') phone_number: string) {
    const normalized = normalizePhone(phone_number);
    let user = await this.usersService.findByPhone(normalized);
    if (!user && normalized !== phone_number) {
      user = await this.usersService.findByPhone(phone_number);
    }
    if (!user) throw new NotFoundException('User not found');
    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
    };
  }

  /** POST /createuser — create customer, auto CUS-ID + wallet */
  @Post('createuser')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phone_number'],
      properties: {
        name: { type: 'string', example: 'John Doe' },
        phone_number: { type: 'string', example: '0771234567' },
        email: { type: 'string', example: 'john@example.com' },
        password: { type: 'string', example: 'secret123' },
      },
    },
  })
  async addUser(@Body() body: any) {
    if (!body || !body.phone_number) {
      throw new ConflictException({
        success: false,
        message: 'phone_number is required',
      });
    }
    const phone = normalizePhone(body.phone_number);

    // Check duplicate phone — same 409 as old system
    const existing = await this.usersService.findByPhone(phone);
    if (existing) {
      throw new ConflictException({
        success: false,
        message: 'You are already registered with this phone number',
        data: { user_id: existing.customerId, phone_number: phone },
      });
    }

    const user = await this.usersService.create({
      firstName: body.name || body.firstName || phone,
      lastName: body.lastName || '',
      email: body.email || undefined,
      password: body.password || undefined,
      phone,
      role: { id: RoleEnum.customer },
    } as any);

    return {
      success: true,
      message: 'User created successfully',
      data: [{ user }],
    };
  }

  /** PUT /updateuser */
  @Put('updateuser')
  @HttpCode(HttpStatus.OK)
  async updateUser(@Body() body: any) {
    const user = await this.usersService.findByCustomerId(body.id);
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.usersService.update(
      user.id as string,
      {
        firstName: body.name || body.firstName,
        email: body.email,
        phone: body.phone_number
          ? normalizePhone(body.phone_number)
          : undefined,
      } as any,
    );

    return {
      success: true,
      message: 'User updated successfully',
      data: updated,
    };
  }

  /** DELETE /deleteuser */
  @Delete('deleteuser')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Body() body: { id: string }) {
    const user = await this.usersService.findByCustomerId(body.id);
    if (!user) throw new NotFoundException('User not found');
    await this.usersService.remove(user.id as string);
    return { success: true, message: 'User deleted successfully' };
  }
}
