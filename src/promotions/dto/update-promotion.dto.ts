import { PartialType } from '@nestjs/swagger';
import { CreatePromotionDto } from './create-promotion.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {
  @ApiPropertyOptional({ description: 'Set false to deactivate promotion' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
