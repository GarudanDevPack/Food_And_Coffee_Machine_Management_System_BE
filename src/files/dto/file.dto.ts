import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class FileDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'MongoDB ObjectId of the uploaded file',
  })
  @IsNotEmpty()
  @IsMongoId()
  id: string;

  path: string;
}
