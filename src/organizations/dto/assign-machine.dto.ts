import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignMachineDto {
  @ApiProperty({
    example: 'MCH-001',
    description: 'Machine.machineId string to assign to this organization',
  })
  @IsString()
  @IsNotEmpty()
  machineId: string;
}
