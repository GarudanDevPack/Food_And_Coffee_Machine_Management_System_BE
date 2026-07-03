import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsDateString,
} from 'class-validator';

export class CreateMachineDto {
  @ApiPropertyOptional({
    description:
      'Firmware machine ID — must match the ID the physical machine uses for MQTT. Auto-generated if omitted.',
    example: 'MCH-001',
  })
  @IsOptional()
  @IsString()
  machineId?: string;

  @ApiProperty({ example: 'Espresso Machine 1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    enum: ['coffee', 'food'],
    default: 'coffee',
    example: 'coffee',
  })
  @IsOptional()
  @IsEnum(['coffee', 'food'])
  machineType?: string;

  @ApiPropertyOptional({ example: 'Floor 1, Building A' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
  })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'maintenance'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({
    description: 'Organization _id this machine belongs to',
  })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoFlushEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'QR code identifier — defaults to machineId if omitted',
    example: 'MCH-001',
  })
  @IsOptional()
  @IsString()
  qrId?: string;

  @ApiPropertyOptional({
    description: 'Last maintenance date (ISO 8601) — defaults to now',
    example: '2026-04-29T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  lastMaintenance?: string;

  @ApiPropertyOptional({
    description: 'Contract / subscription expiry date (ISO 8601)',
    example: '2027-04-29T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  expireAt?: string;
}
