import { PartialType } from '@nestjs/swagger';
import { CreateMachineDto } from './create-machine.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsBoolean,
  IsNumber,
} from 'class-validator';

export class UpdateMachineDto extends PartialType(CreateMachineDto) {
  @ApiPropertyOptional({ enum: ['active', 'inactive', 'maintenance'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'maintenance'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;
}

export class UpdateInventoryDto {
  @ApiPropertyOptional()
  @IsString()
  itemId: string;

  @ApiPropertyOptional()
  @IsNumber()
  currentStock: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nozzle?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  gramsPerCup?: number;
}

export class UpdateCalibrationDto {
  @ApiPropertyOptional()
  @IsString()
  itemId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  nozzle?: number;

  @ApiPropertyOptional()
  @IsNumber()
  timerOfPowder: number;

  @ApiPropertyOptional()
  @IsNumber()
  timerOfWater: number;

  @ApiPropertyOptional()
  @IsString()
  cupSize: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  volMl?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  volGram?: number;
}
