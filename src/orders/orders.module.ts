import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { WalletModule } from '../wallet/wallet.module';
import { MachinesModule } from '../machines/machines.module';
import { ItemsModule } from '../items/items.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromotionsModule } from '../promotions/promotions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    WalletModule,
    MachinesModule,
    ItemsModule,
    MembershipsModule,
    NotificationsModule,
    PromotionsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
