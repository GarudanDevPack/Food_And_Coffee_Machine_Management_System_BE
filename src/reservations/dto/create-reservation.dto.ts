import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty() @IsString() @IsNotEmpty() machineId: string;
  @ApiProperty() @IsString() @IsNotEmpty() itemId: string;
  @ApiProperty() @IsString() @IsNotEmpty() itemName: string;
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsString()
  @IsNotEmpty()
  date: string;
  @ApiProperty({ enum: ['morning', 'lunch', 'dinner', 'custom'] })
  @IsIn(['morning', 'lunch', 'dinner', 'custom'])
  timeSlot: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customTime?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
