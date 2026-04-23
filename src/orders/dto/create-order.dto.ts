import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'MCH-001' })
  @IsString()
  @IsNotEmpty()
  machineId: string;

  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB _id of the item',
  })
  @IsMongoId()
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
  @IsMongoId()
  targetUserId?: string;
}
