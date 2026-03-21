import { NestFactory } from '@nestjs/core';
import { UserSeedService } from './user/user-seed.service';
import { DataSeedService } from './data/data-seed.service';
import { SeedModule } from './seed.module';

const runSeed = async () => {
  const app = await NestFactory.create(SeedModule);

  await app.get(UserSeedService).run();
  await app.get(DataSeedService).run();

  await app.close();
};

void runSeed();
