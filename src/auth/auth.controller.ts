import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  Response,
  SerializeOptions,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { AdminRegisterDto } from './dto/admin-register.dto';
import { AgentRegisterDto } from './dto/agent-register.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { NullableType } from '../utils/types/nullable.type';
import { User } from '../users/domain/user';
import { AllConfigType } from '../config/config.type';
import { JwtAuth } from './guards/jwt-auth.guard';
import { RoleEnum } from '../roles/roles.enum';

/** Cookie options shared across set/clear */
const ACCESS_COOKIE = 'accessToken';
const REFRESH_COOKIE = 'refreshToken';

@ApiTags('Auth')
@UseInterceptors(ClassSerializerInterceptor)
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────────

  private setAuthCookies(
    res: ExpressResponse,
    token: string,
    refreshToken: string,
    tokenExpires: number,
  ): void {
    const isProduction =
      this.configService.get('app.nodeEnv', { infer: true }) === 'production';

    // Access-token cookie — short-lived
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      expires: new Date(tokenExpires),
      path: '/',
    });

    // Refresh-token cookie — long-lived
    const refreshExpires = this.configService.getOrThrow(
      'auth.refreshExpires',
      {
        infer: true,
      },
    ) as string;
    const refreshMs = this.parseDurationMs(refreshExpires);

    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      expires: new Date(Date.now() + refreshMs),
      path: '/',
    });
  }

  private clearAuthCookies(res: ExpressResponse): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
  }

  /** Convert duration strings like "7d", "30m", "3600s" to milliseconds */
  private parseDurationMs(duration: string): number {
    const units: Record<string, number> = {
      d: 86_400_000,
      h: 3_600_000,
      m: 60_000,
      s: 1_000,
    };
    const match = /^(\d+)([dhms])$/.exec(duration);
    if (!match) return 7 * 86_400_000; // default 7 days
    return parseInt(match[1], 10) * units[match[2]];
  }

  // ─── public routes ───────────────────────────────────────────────────────────

  /**
   * Customer self-registration.
   * Assigns role=customer, status=inactive.
   * Sends a confirmation email — user must verify before logging in.
   */
  @Post('email/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@Body() createUserDto: AuthRegisterLoginDto): Promise<void> {
    return this.service.register(createUserDto);
  }

  // ─── admin-provisioned registration ──────────────────────────────────────────

  /**
   * Create a privileged user account (Admin / Client / Agent / Customer).
   *
   * Role hierarchy enforced server-side:
   *   SuperAdmin → can create  admin | client | agent | customer
   *   Admin      → can create         client | agent | customer
   *
   * Provisioned accounts are immediately active (no email confirmation).
   * SuperAdmin accounts are NEVER created via this endpoint (seed-only).
   */
  @JwtAuth(RoleEnum.super_admin, RoleEnum.admin)
  @SerializeOptions({ groups: ['admin'] })
  @Post('admin/register')
  @ApiCreatedResponse({ type: User })
  @HttpCode(HttpStatus.CREATED)
  async adminRegister(
    @Request() request: ExpressRequest,
    @Body() dto: AdminRegisterDto,
  ): Promise<User> {
    const callerRole: RoleEnum = (request as any).user.role.id;
    return this.service.adminRegister(callerRole, dto);
  }

  /**
   * Agent self-registration (public — no JWT required).
   *
   * Creates an agent account with status=inactive.
   * The agent CANNOT log in until an admin approves the account via
   * PATCH /users/:id/approve, which sets status=active.
   *
   * Returns the created agent record so the admin can identify it for approval.
   */
  @Post('agent/register')
  @ApiCreatedResponse({
    type: User,
    description: 'Inactive agent account created — pending admin approval',
  })
  @HttpCode(HttpStatus.CREATED)
  async agentRegister(@Body() dto: AgentRegisterDto): Promise<User> {
    return this.service.registerAgent(dto);
  }

  @Post('email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmEmail(confirmEmailDto.hash);
  }

  @Post('email/confirm/new')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmNewEmail(
    @Body() confirmEmailDto: AuthConfirmEmailDto,
  ): Promise<void> {
    return this.service.confirmNewEmail(confirmEmailDto.hash);
  }

  @Post('forgot/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body() forgotPasswordDto: AuthForgotPasswordDto,
  ): Promise<void> {
    return this.service.forgotPassword(forgotPasswordDto.email);
  }

  @Post('reset/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() resetPasswordDto: AuthResetPasswordDto): Promise<void> {
    return this.service.resetPassword(
      resetPasswordDto.hash,
      resetPasswordDto.password,
    );
  }

  // ─── login ───────────────────────────────────────────────────────────────────

  /**
   * Returns the logged-in user and sets HttpOnly cookies:
   *   - accessToken  (short-lived)
   *   - refreshToken (long-lived)
   *
   * Tokens are also returned in the response body for programmatic clients
   * (mobile apps, Swagger testing) that cannot read HttpOnly cookies.
   */
  @SerializeOptions({ groups: ['me'] })
  @Post('email/login')
  @ApiOkResponse({ type: LoginResponseDto })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: AuthEmailLoginDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginResponseDto> {
    const result = await this.service.validateLogin(loginDto);
    this.setAuthCookies(
      res,
      result.token,
      result.refreshToken,
      result.tokenExpires,
    );
    return result;
  }

  // ─── protected routes ────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth('accessToken')
  @SerializeOptions({ groups: ['me'] })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: User })
  @HttpCode(HttpStatus.OK)
  public me(@Request() request: ExpressRequest): Promise<NullableType<User>> {
    return this.service.me((request as any).user);
  }

  @ApiBearerAuth()
  @ApiCookieAuth('accessToken')
  @SerializeOptions({ groups: ['me'] })
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOkResponse({ type: User })
  @HttpCode(HttpStatus.OK)
  public update(
    @Request() request: ExpressRequest,
    @Body() userDto: AuthUpdateDto,
  ): Promise<NullableType<User>> {
    return this.service.update((request as any).user, userDto);
  }

  @ApiBearerAuth()
  @ApiCookieAuth('accessToken')
  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Request() request: ExpressRequest): Promise<void> {
    return this.service.softDelete((request as any).user);
  }

  // ─── refresh ─────────────────────────────────────────────────────────────────

  /**
   * Reads the refreshToken cookie (or Bearer header fallback),
   * rotates both tokens, and sets fresh cookies.
   */
  @ApiBearerAuth()
  @ApiCookieAuth('refreshToken')
  @ApiOkResponse({ type: RefreshResponseDto })
  @SerializeOptions({ groups: ['me'] })
  @Post('refresh')
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  public async refresh(
    @Request() request: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<RefreshResponseDto> {
    const result = await this.service.refreshToken({
      sessionId: (request as any).user.sessionId,
      hash: (request as any).user.hash,
    });
    this.setAuthCookies(
      res,
      result.token,
      result.refreshToken,
      result.tokenExpires,
    );
    return result;
  }

  // ─── logout ──────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @ApiCookieAuth('accessToken')
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  public async logout(
    @Request() request: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<void> {
    this.clearAuthCookies(res);
    await this.service.logout({ sessionId: (request as any).user.sessionId });
  }

  // ─── OTP Phone Login ──────────────────────────────────────────────────────────

  /**
   * POST /auth/phone/send-otp
   * Sends a 6-digit OTP to the user's registered phone number via Twilio SMS.
   * No auth required.
   */
  @Post('phone/send-otp')
  @HttpCode(HttpStatus.OK)
  async sendPhoneOtp(
    @Body() body: { phone: string },
  ): Promise<{ message: string }> {
    return this.service.sendPhoneOtp(body.phone);
  }

  /**
   * POST /auth/phone/verify-otp
   * Verifies the OTP and returns JWT + session (same response as email login).
   * No auth required.
   */
  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyPhoneOtp(
    @Body() body: { phone: string; code: string },
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginResponseDto> {
    const result = await this.service.verifyPhoneOtp(body.phone, body.code);
    this.setAuthCookies(
      res,
      result.token,
      result.refreshToken,
      result.tokenExpires,
    );
    return result;
  }
}
