import {
  // common
  Module,
} from '@nestjs/common';

import { UsersController } from './users.controller';

import { UsersService } from './users.service';
import { DocumentUserPersistenceModule } from './infrastructure/persistence/document/document-persistence.module';
import { FilesModule } from '../files/files.module';
import { WalletModule } from '../wallet/wallet.module';

const infrastructurePersistenceModule = DocumentUserPersistenceModule;

@Module({
  imports: [infrastructurePersistenceModule, FilesModule, WalletModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, infrastructurePersistenceModule],
})
export class UsersModule {}
