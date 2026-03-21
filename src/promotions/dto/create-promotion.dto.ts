import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreatePromotionDto {
  @ApiProperty({ example: 'Weekend Sale' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: '20% off all drinks this weekend!' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '64f1b2c3d4e5f6a7b8c9d0e1',
    description: 'MongoDB _id of the item. Omit to apply to ALL items.',
  })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({ example: 20, description: 'Discount percentage (1–100)' })
  @IsNumber()
  @Min(1)
  @Max(100)
  discountPct: number;

  @ApiProperty({ example: '2026-03-20T00:00:00.000Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-23T23:59:59.000Z' })
  @IsDateString()
  endDate: string;
}
