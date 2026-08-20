import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsEnum,
  Min,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';

export class UpdateMachineStockDto {
  @ApiProperty({
    example: 10,
    description: 'Units (cups for coffee, units for food) to load or unload',
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: ['load', 'unload'], example: 'load' })
  @IsEnum(['load', 'unload'])
  action: 'load' | 'unload';

  // ── Food machine load fields ─────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: 2,
    description: 'Nozzle/slot number — required when loading a food machine',
  })
  @IsOptional()
  @IsInt()
  nozzleId?: number;

  @ApiPropertyOptional({
    example: 'Club Sandwich',
    description:
      'Item display name cached on the batch — optional for food load',
  })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description:
      'Batch expiry date ISO 8601 — defaults to 7 days from now if omitted',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
