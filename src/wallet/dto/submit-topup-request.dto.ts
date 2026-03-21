import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';

/**
 * Request body for submitting a bank slip top-up request.
 * The customer provides the amount they transferred and the URL
 * of their uploaded bank slip image. Admin reviews and approves.
 */
export class SubmitTopupRequestDto {
  @ApiProperty({
    example: 1000,
    description: 'Amount transferred in LKR (minimum 1)',
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    example: 'https://s3.amazonaws.com/bucket/slips/slip-abc123.jpg',
    description:
      'URL of the uploaded bank slip image (from POST /files/upload)',
  })
  @IsUrl()
  paymentSlipUrl: string;

  @ApiPropertyOptional({
    example: 'Bank reference: TXN-20260316-00123',
    description:
      'Optional note from the customer (bank reference, remarks, etc.)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
