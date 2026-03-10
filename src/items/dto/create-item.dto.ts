import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, ValidateNested, IsNumber, Min, IsArray } from 'class-validator';
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

  @ApiProperty({ type: [CupSizeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CupSizeDto)
  cupSizes: CupSizeDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
