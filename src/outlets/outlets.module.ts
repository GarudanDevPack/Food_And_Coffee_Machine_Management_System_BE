import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Outlet, OutletSchema } from './schemas/outlet.schema';
import { OutletsService } from './outlets.service';
import { OutletsController } from './outlets.controller';
import { MachinesModule } from '../machines/machines.module';
import { ItemsModule } from '../items/items.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Outlet.name, schema: OutletSchema }]),
    MachinesModule,
    ItemsModule,
  ],
  controllers: [OutletsController],
  providers: [OutletsService],
  exports: [OutletsService],
})
export class OutletsModule {}
