import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export class CreateAlertDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  machineId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({
    enum: [
      'low_stock',
      'machine_offline',
      'dispense_failure',
      'maintenance_required',
      'custom',
    ],
  })
  @IsEnum([
    'low_stock',
    'machine_offline',
    'dispense_failure',
    'maintenance_required',
    'custom',
  ])
  type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: string;
}
