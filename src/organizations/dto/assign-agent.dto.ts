import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AssignAgentDto {
  @ApiProperty({
    example: '687a1b2c3d4e5f6a7b8c9d0e',
    description: 'MongoDB _id of the agent user to assign',
  })
  @IsString()
  @IsNotEmpty()
  agentId: string;
}
