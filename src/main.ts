import 'dotenv/config';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import validationOptions from './utils/validation-options';
import { AllConfigType } from './config/config.type';
import { ResolvePromisesInterceptor } from './utils/serializer.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

  // Cookie-based auth — must be before guards that read cookies
  app.use(cookieParser());

  // CORS: allow credentials so browser sends HttpOnly cookies
  const frontendDomain = configService.get('app.frontendDomain', {
    infer: true,
  }) as string | undefined;
  const allowedOrigins = frontendDomain
    ? frontendDomain.split(',').map((o) => o.trim())
    : true;
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-custom-lang'],
  });

  app.enableShutdownHooks();
  // Legacy mobile-app paths are excluded from the /api prefix
  const legacyRoutes = [
    { path: 'getuser', method: RequestMethod.GET },
    { path: 'getuserbynumber', method: RequestMethod.GET },
    { path: 'createuser', method: RequestMethod.POST },
    { path: 'updateuser', method: RequestMethod.PUT },
    { path: 'deleteuser', method: RequestMethod.DELETE },
    { path: 'wallets', method: RequestMethod.GET },
    { path: 'getwallet', method: RequestMethod.GET },
    { path: 'getwalletbyuser', method: RequestMethod.GET },
    { path: 'createwallet', method: RequestMethod.POST },
    { path: 'updatewallet', method: RequestMethod.PUT },
    { path: 'deletewallet', method: RequestMethod.DELETE },
    { path: 'update-wallet-amount', method: RequestMethod.PUT },
    // Legacy order routes used by mobile app and hardware machines
    { path: 'createorder', method: RequestMethod.POST },
    { path: 'updateorderbymachine', method: RequestMethod.PUT },
    { path: 'getlastorderbymachine', method: RequestMethod.GET },
    { path: 'getorderbymachine', method: RequestMethod.GET },
    { path: 'getorderbyuser', method: RequestMethod.GET },
    { path: 'ordersbyuser', method: RequestMethod.GET },
    { path: 'orderbyid', method: RequestMethod.GET },
    // Legacy machine routes used by admin panel and mobile app
    { path: 'getmachinelog', method: RequestMethod.GET },
    { path: 'getmachinesitems', method: RequestMethod.GET },
    { path: 'getvolumesizes', method: RequestMethod.GET },
    { path: 'getallmachinelogs', method: RequestMethod.GET },
    { path: 'getallmachinebyclient', method: RequestMethod.GET },
    { path: 'updatemachinelog', method: RequestMethod.PUT },
    { path: 'updatemachinelogstatus', method: RequestMethod.PUT },
  ];

  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: ['/', ...legacyRoutes],
    },
  );
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalInterceptors(
    // ResolvePromisesInterceptor is used to resolve promises in responses because class-transformer can't do it
    // https://github.com/typestack/class-transformer/issues/549
    new ResolvePromisesInterceptor(),
  );

  const options = new DocumentBuilder()
    .setTitle('Coffee Vending API')
    .setDescription(
      'API docs — auth via HttpOnly cookie (Bearer fallback for Swagger)',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('accessToken')
    .addGlobalParameters({
      in: 'header',
      required: false,
      name: process.env.APP_HEADER_LANGUAGE || 'x-custom-lang',
      schema: {
        example: 'en',
      },
    })
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('docs', app, document);

  await app.listen(
    process.env.PORT || configService.getOrThrow('app.port', { infer: true }),
  );
}
void bootstrap();
