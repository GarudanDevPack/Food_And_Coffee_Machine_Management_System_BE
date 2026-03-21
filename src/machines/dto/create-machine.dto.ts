import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
} from 'class-validator';

export class CreateMachineDto {
  @ApiPropertyOptional({
    example: 'cm_lz4abc12_x7r9kp2q',
    description:
      'Auto-generated if omitted. Prefix: cm_ for coffee, vd_ for food/vending.',
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
}
