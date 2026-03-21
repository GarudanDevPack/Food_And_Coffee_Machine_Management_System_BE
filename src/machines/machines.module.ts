import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Machine, MachineSchema } from './schemas/machine.schema';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { MachinesPublicController } from './machines-public.controller';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { WalletModule } from '../wallet/wallet.module';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Machine.name, schema: MachineSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Item.name, schema: ItemSchema },
    ]),
    WalletModule,
    AlertsModule,
    NotificationsModule,
  ],
  controllers: [MachinesController, MachinesPublicController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
