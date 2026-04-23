import { Module } from '@nestjs/common';
import { LegacyUsersController } from './legacy-users.controller';
import { LegacyWalletController } from './legacy-wallet.controller';
import { LegacyOrdersController } from './legacy-orders.controller';
import { LegacyMachinesController } from './legacy-machines.controller';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';
import { MachinesModule } from '../machines/machines.module';

/**
 * LegacyModule — provides backward-compatible endpoints matching the old Express API.
 * Used by the mobile app. Routes are excluded from the global /api prefix.
 */
@Module({
  imports: [UsersModule, WalletModule, OrdersModule, MachinesModule],
  controllers: [
    LegacyUsersController,
    LegacyWalletController,
    LegacyOrdersController,
    LegacyMachinesController,
  ],
})
export class LegacyModule {}
