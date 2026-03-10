import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsEnum, IsOptional, IsString, Min } from 'class-validator';

export class TopupDto {
  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: ['topup_qr', 'topup_bank'] })
  @IsEnum(['topup_qr', 'topup_bank'])
  category: string;

  @ApiPropertyOptional({ description: 'Bank slip image URL or QR reference' })
  @IsOptional()
  @IsString()
  paymentSlipUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;
}
