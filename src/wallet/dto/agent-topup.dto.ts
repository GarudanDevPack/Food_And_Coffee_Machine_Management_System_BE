import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class AgentTopupDto {
  @ApiProperty({
    example: 'CUS-20240101-123456',
    description: 'Customer human-readable ID from QR code',
  })
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({ example: 500, description: 'Amount to credit (LKR)' })
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({
    example: 'agent_mongo_id_here',
    description: 'Agent ID — ignored server-side, taken from JWT',
  })
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional({ example: 'Cash payment at outlet #3' })
  @IsOptional()
  @IsString()
  note?: string;
}
