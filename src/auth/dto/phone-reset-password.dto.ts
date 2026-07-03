import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PhoneResetPasswordDto {
  @ApiProperty({ example: '0771234567' })
  @IsNotEmpty()
  @IsString()
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ example: 'newPassword123', minLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password!: string;
}
