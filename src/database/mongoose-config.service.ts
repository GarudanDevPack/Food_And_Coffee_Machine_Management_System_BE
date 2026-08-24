import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MongooseModuleOptions,
  MongooseOptionsFactory,
} from '@nestjs/mongoose';
import { AllConfigType } from '../config/config.type';
import mongooseAutoPopulate from 'mongoose-autopopulate';

@Injectable()
export class MongooseConfigService implements MongooseOptionsFactory {
  constructor(private configService: ConfigService<AllConfigType>) {}

  createMongooseOptions(): MongooseModuleOptions {
    const url =
      process.env.DATABASE_URL ||
      this.configService.get('database.url', { infer: true });
    const username =
      process.env.DATABASE_USERNAME ||
      this.configService.get('database.username', { infer: true });
    const password =
      process.env.DATABASE_PASSWORD ||
      this.configService.get('database.password', { infer: true });
    console.log('[MongooseConfig] url =', url ?? '(undefined)');
    return {
      uri: url,
      dbName: this.configService.get('database.name', { infer: true }),
      // Only pass user/pass when not embedded in the URI (avoids overriding Atlas credentials)
      ...(username && !url?.includes('@') ? { user: username } : {}),
      ...(password && !url?.includes('@') ? { pass: password } : {}),
      connectionFactory(connection) {
        connection.plugin(mongooseAutoPopulate);
        return connection;
      },
    };
  }
}
