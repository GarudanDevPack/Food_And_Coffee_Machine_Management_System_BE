import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Machine, MachineSchema } from './schemas/machine.schema';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Machine.name, schema: MachineSchema }]),
  ],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
