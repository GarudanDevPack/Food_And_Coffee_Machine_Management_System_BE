import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PhoneForgotPasswordDto {
  @ApiProperty({ example: '0771234567' })
  @IsNotEmpty()
  @IsString()
  phone!: string;
}
