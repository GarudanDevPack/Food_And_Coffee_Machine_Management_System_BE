import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, Min, IsEnum } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'MACHINE_001' })
  @IsString()
  @IsNotEmpty()
  machineId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ enum: ['small', 'medium', 'large'] })
  @IsEnum(['small', 'medium', 'large'])
  cupSize: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
}
