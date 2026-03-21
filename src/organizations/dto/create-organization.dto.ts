import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEmail,
  IsUrl,
} from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'ABC Hotels Group' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '687a1b2c3d4e5f6a7b8c9d0e',
    description:
      'MongoDB _id of the client user (role=client) who owns this org',
  })
  @IsString()
  @IsNotEmpty()
  clientUserId: string;

  @ApiPropertyOptional({ example: 'No. 12, Galle Road, Colombo 03' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+94112345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'info@abchotels.lk' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/abc-logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiProperty({
    example: '2026-01-01',
    description: 'Contract start date (ISO 8601)',
  })
  @IsDateString()
  contractStart: string;

  @ApiPropertyOptional({
    example: '2027-01-01',
    description: 'Contract end date (ISO 8601). Omit if open-ended.',
  })
  @IsOptional()
  @IsDateString()
  contractEnd?: string;

  @ApiPropertyOptional({ example: 'Premium partner, 3-machine pilot' })
  @IsOptional()
  @IsString()
  notes?: string;
}
