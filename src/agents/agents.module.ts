import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { MachinesModule } from '../machines/machines.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletModule } from '../wallet/wallet.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AgentLog, AgentLogSchema } from './schemas/agent-log.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';

@Module({
  imports: [
    MachinesModule,
    OrdersModule,
    WalletModule,
    MembershipsModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: AgentLog.name, schema: AgentLogSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
