import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Advertisement, AdvertisementSchema } from './schemas/advertisement.schema';
import { AdvertisementsService } from './advertisements.service';
import { AdvertisementsController } from './advertisements.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Advertisement.name, schema: AdvertisementSchema }]),
  ],
  controllers: [AdvertisementsController],
  providers: [AdvertisementsService],
  exports: [AdvertisementsService],
})
export class AdvertisementsModule {}
