import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DataSeedService } from './data-seed.service';
import {
  UserSchemaClass,
  UserSchema,
} from '../../../../users/infrastructure/persistence/document/entities/user.schema';
import {
  Machine,
  MachineSchema,
} from '../../../../machines/schemas/machine.schema';
import { Item, ItemSchema } from '../../../../items/schemas/item.schema';
import {
  Organization,
  OrganizationSchema,
} from '../../../../organizations/schemas/organization.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserSchemaClass.name, schema: UserSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: Item.name, schema: ItemSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  providers: [DataSeedService],
  exports: [DataSeedService],
})
export class DataSeedModule {}
