import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Machine, MachineSchema } from '../machines/schemas/machine.schema';
import {
  Transaction,
  TransactionSchema,
} from '../wallet/schemas/transaction.schema';
import { Alert, AlertSchema } from '../alerts/schemas/alert.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
