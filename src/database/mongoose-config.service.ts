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
    const url = this.configService.get('database.url', { infer: true });
    const username = this.configService.get('database.username', {
      infer: true,
    });
    const password = this.configService.get('database.password', {
      infer: true,
    });
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
