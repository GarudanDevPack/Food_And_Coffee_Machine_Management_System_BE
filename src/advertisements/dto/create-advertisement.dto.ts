import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsDateString,
} from 'class-validator';

export class CreateAdvertisementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetUrl?: string;

  @ApiPropertyOptional({
    enum: ['all', 'specific_machines', 'specific_clients'],
    default: 'all',
  })
  @IsOptional()
  @IsEnum(['all', 'specific_machines', 'specific_clients'])
  targetType?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  targetIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
