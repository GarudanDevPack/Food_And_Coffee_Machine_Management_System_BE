import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { RoleEnum } from '../../roles/roles.enum';

/**
 * Roles that can be provisioned via the admin registration endpoint.
 * SuperAdmin is NEVER created through an API — only via DB seed.
 */
export enum ProvisionableRole {
  admin = RoleEnum.admin,
  client = RoleEnum.client,
  agent = RoleEnum.agent,
  customer = RoleEnum.customer,
}

export class AdminRegisterDto {
  @ApiProperty({ example: 'operator@example.com', type: String })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 6 })
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  lastName: string;

  /**
   * Role to assign.
   *   - SuperAdmin can assign: admin, client, agent, customer
   *   - Admin can assign:      client, agent, customer
   * Role hierarchy is enforced in AuthService, not in DTO validation.
   */
  @ApiProperty({
    enum: ProvisionableRole,
    example: ProvisionableRole.agent,
    description: 'admin | client | agent | customer  (super_admin is seed-only)',
  })
  @IsEnum(ProvisionableRole)
  role: ProvisionableRole;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;
}
