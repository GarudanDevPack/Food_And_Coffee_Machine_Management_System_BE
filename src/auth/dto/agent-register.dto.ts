import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

/**
 * Request body for public agent self-registration.
 *
 * Agents register themselves via POST /auth/agent/register.
 * The created account is set to status=inactive (pending admin approval).
 * An admin must call PATCH /users/:id/approve before the agent can log in.
 */
export class AgentRegisterDto {
  @ApiProperty({ example: 'agent@example.com', type: String })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 6, description: 'Password (min 6 characters)' })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'Kasun' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Perera' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional({
    example: '+94771234567',
    description:
      'Phone number — normalised to +94XXXXXXXXX for Sri Lanka numbers',
  })
  @IsOptional()
  @IsString()
  phone?: string;
}
