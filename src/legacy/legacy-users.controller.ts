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
 *
 * Admin panel compatibility routes (served at /api/login — NOT excluded from global prefix):
 *   POST   /login              admin panel: email+password login, sets HttpOnly cookies,
 *                              returns { data: { ...user, token, refreshToken } }
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiBody, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { AllConfigType } from '../config/config.type';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  /**
   * POST /login  (served at /api/login — not in legacy exclude list so it keeps the global prefix)
   * Admin panel: email+password login.
   * Sets HttpOnly accessToken + refreshToken cookies and returns
   * { data: { ...user, token, refreshToken } } matching the old Express format.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'POST /api/login — admin panel: email+password login, sets cookies' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', example: 'admin@example.com' },
        password: { type: 'string', example: 'secret123' },
      },
    },
  })
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.validateLogin({
      email: body.email,
      password: body.password,
    });

    const isProduction =
      this.configService.get('app.nodeEnv', { infer: true }) === 'production';

    res.cookie('accessToken', result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      expires: new Date(result.tokenExpires),
      path: '/',
    });

    const refreshExpiresStr = (this.configService.getOrThrow(
      'auth.refreshExpires',
      { infer: true },
    ) as string) || '30d';
    const durationUnits: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };
    const durationMatch = /^(\d+)([dhms])$/.exec(refreshExpiresStr);
    const refreshMs = durationMatch
      ? parseInt(durationMatch[1], 10) * durationUnits[durationMatch[2]]
      : 30 * 24 * 60 * 60 * 1000;

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      expires: new Date(Date.now() + refreshMs),
      path: '/',
    });

    return {
      data: {
        ...result.user,
        token: result.token,
        refreshToken: result.refreshToken,
      },
    };
  }

  /**
   * POST /logout  (served at /api/logout — keeps global prefix, clears HttpOnly cookies)
   * Admin panel: invalidates the current session and clears both auth cookies.
   * Does not require a valid JWT so it always succeeds even with a stale/expired token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'POST /api/logout — admin panel: clear auth cookies' })
  async logout(@Res({ passthrough: true }) res: ExpressResponse) {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    return { success: true, message: 'Logged out successfully' };
  }

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
