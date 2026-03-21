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
    example: 'user_mongo_id_here',
    description: 'Target customer user ID',
  })
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @ApiProperty({ example: 500, description: 'Amount to credit (LKR)' })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 'Cash payment at outlet #3' })
  @IsOptional()
  @IsString()
  note?: string;
}
