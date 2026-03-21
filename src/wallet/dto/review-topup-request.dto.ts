import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body for approving or rejecting a top-up request.
 * Used for both PATCH .../approve and PATCH .../reject endpoints.
 *
 * - On approval  : reviewNote is optional (e.g. "Verified — credited 1000 LKR")
 * - On rejection : reviewNote is strongly recommended (e.g. "Slip image unclear — resubmit")
 */
export class ReviewTopupRequestDto {
  @ApiPropertyOptional({
    example: 'Slip verified successfully.',
    description: 'Optional admin note. Strongly recommended when rejecting.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
