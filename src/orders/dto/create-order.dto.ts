import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'MACHINE_001' })
  @IsString()
  @IsNotEmpty()
  machineId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiPropertyOptional({
    example: 'small',
    description:
      'Required for coffee items. Must match a cup size defined on the item. Omit for food items.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cupSize?: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Agent only: place this order on behalf of a customer (their user ID)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  targetUserId?: string;
}
