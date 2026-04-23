import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMinSize,
} from 'class-validator';

export class CreateOutletDto {
  @ApiProperty({
    example: 'Coffee Corner - Block A',
    description: 'Display name for this outlet',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Ground Floor, Building A, Main Street' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 6.9271 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 79.8612 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Client user ID this outlet belongs to' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({
    type: [String],
    example: ['MACHINE_001', 'MACHINE_002'],
    description:
      'List of machine IDs (machineId field, not MongoDB _id) assigned to this outlet',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  machineIds: string[];
}
