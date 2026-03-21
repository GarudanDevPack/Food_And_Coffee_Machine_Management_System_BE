import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';

export class LoadBatchDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Item MongoDB _id',
  })
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({
    example: 'Club Sandwich',
    description: 'Item name (cached for display)',
  })
  @IsString()
  @IsNotEmpty()
  itemName: string;

  @ApiProperty({
    example: 2,
    description: 'Physical nozzle/slot number on the machine',
  })
  @IsInt()
  @Min(1)
  nozzleId: number;

  @ApiProperty({
    example: 30,
    description: 'Number of units loaded into this batch',
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: '2026-03-25', description: 'Expiry date (ISO 8601)' })
  @IsDateString()
  expiryDate: string;
}
