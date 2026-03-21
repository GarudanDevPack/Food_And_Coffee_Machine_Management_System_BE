import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateMembershipDto {
  @ApiProperty({
    enum: ['1month', '3month', '5month'],
    description:
      '1month=15% off (500 LKR), 3month=20% off (1300 LKR), 5month=25% off (2000 LKR)',
  })
  @IsEnum(['1month', '3month', '5month'])
  plan: string;

  @ApiPropertyOptional({
    description:
      'Agent only: target customer user ID to subscribe on their behalf',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsString()
  targetUserId?: string;
}
