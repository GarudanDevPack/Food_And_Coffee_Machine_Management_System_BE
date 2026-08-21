import { registerAs } from '@nestjs/config';

import { IsOptional, IsString } from 'class-validator';
import validateConfig from '../../utils/validate-config';
import { AuthConfig } from './auth-config.type';
import ms from 'ms';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  AUTH_JWT_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_JWT_TOKEN_EXPIRES_IN: string;

  @IsString()
  @IsOptional()
  AUTH_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_REFRESH_TOKEN_EXPIRES_IN: string;

  @IsString()
  @IsOptional()
  AUTH_FORGOT_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_FORGOT_TOKEN_EXPIRES_IN: string;

  @IsString()
  @IsOptional()
  AUTH_CONFIRM_EMAIL_SECRET: string;

  @IsString()
  @IsOptional()
  AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN: string;
}

export default registerAs<AuthConfig>('auth', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    secret: process.env.AUTH_JWT_SECRET ?? 'qfox_jwt_secret_2024',
    expires: (process.env.AUTH_JWT_TOKEN_EXPIRES_IN ?? '12h') as ms.StringValue,
    refreshSecret:
      process.env.AUTH_REFRESH_SECRET ?? 'qfox_refresh_secret_2024',
    refreshExpires: (process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN ??
      '3650d') as ms.StringValue,
    forgotSecret: process.env.AUTH_FORGOT_SECRET ?? 'qfox_forgot_secret_2024',
    forgotExpires: (process.env.AUTH_FORGOT_TOKEN_EXPIRES_IN ??
      '30m') as ms.StringValue,
    confirmEmailSecret:
      process.env.AUTH_CONFIRM_EMAIL_SECRET ?? 'qfox_confirm_email_secret_2024',
    confirmEmailExpires: (process.env.AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN ??
      '1d') as ms.StringValue,
  };
});
