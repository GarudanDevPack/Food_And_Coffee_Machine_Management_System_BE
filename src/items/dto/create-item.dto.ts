import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CupSizeDto {
  @ApiProperty({ example: 'small' })
  @IsString()
  size: string;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @IsNumber()
  timerOfPowder?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  timerOfWater?: number;
}

export class CreateItemDto {
  @ApiProperty({ example: 'Espresso' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Coffee' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({
    enum: ['coffee', 'food'],
    example: 'coffee',
    description: 'coffee = uses cupSizes[]; food = uses unitPrice',
  })
  @IsEnum(['coffee', 'food'])
  itemType: 'coffee' | 'food';

  @ApiPropertyOptional({
    example: 150,
    description: 'Required for food items — single flat price per unit',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    description:
      'Scope item to a specific client user ID. Omit for global item.',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description:
      'Scope item to a specific organization ID. Omit for global item.',
  })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({
    type: [CupSizeDto],
    description:
      'Required for coffee items. Each entry defines a size, price, and dispense timers.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CupSizeDto)
  cupSizes?: CupSizeDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
