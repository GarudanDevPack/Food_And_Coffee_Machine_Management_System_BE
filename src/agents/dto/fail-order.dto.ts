import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for the agent "fail order" endpoint.
 * The reason is optional — a sensible default is applied in the service when omitted.
 */
export class FailOrderDto {
  @ApiPropertyOptional({
    example: 'Machine jammed — product could not be dispensed',
    description:
      'Human-readable reason for the failure (used in refund notification)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
