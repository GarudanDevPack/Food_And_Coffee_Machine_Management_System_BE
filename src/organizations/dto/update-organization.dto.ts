import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateOrganizationDto } from './create-organization.dto';

export class UpdateOrganizationDto extends PartialType(
  OmitType(CreateOrganizationDto, ['clientUserId'] as const),
) {}
