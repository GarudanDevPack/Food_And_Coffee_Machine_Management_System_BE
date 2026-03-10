import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtRefreshPayloadType } from './types/jwt-refresh-payload.type';
import { OrNeverType } from '../../utils/types/or-never.type';
import { AllConfigType } from '../../config/config.type';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService<AllConfigType>) {
    super({
      // Cookie-first; falls back to Bearer header for Swagger/mobile clients
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.refreshToken ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: configService.getOrThrow('auth.refreshSecret', {
        infer: true,
      }),
      passReqToCallback: false,
    });
  }

  public validate(
    payload: JwtRefreshPayloadType,
  ): OrNeverType<JwtRefreshPayloadType> {
    if (!payload.sessionId) {
      throw new UnauthorizedException();
    }

    return payload;
  }
}
