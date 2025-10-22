import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LoggerService } from '@shared/services/logger.service';
import { AppModule } from './app.module';
import { RpcValidationException } from './common/exceptions/rpc-validation.exception';
import { PAYMENT_PACKAGE_NAME } from './protogen/payment.pb';
import { join } from 'path/win32';

async function bootstrap() {
  const HOST = process.env.HOST || '0.0.0.0';
  const GRPC_PORT = process.env.GRPC_PORT || '50055';
  const PORT = process.env.PORT || '8085';

  // Create as gRPC microservice first (primary service)
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      url: `${HOST}:${GRPC_PORT}`,
      package: PAYMENT_PACKAGE_NAME,
      protoPath: join(__dirname, 'protos', 'payment.proto'),
    },
  });

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  // Configure validation for gRPC (primary service)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        throw new RpcValidationException('Validation failed', errors);
      },
    }),
  );

  const httpApp = await NestFactory.create(AppModule);
  httpApp.useLogger(logger);

  httpApp.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  await httpApp.listen(PORT);
  logger.log(`HTTP Server (callbacks) running on: http://${HOST}:${PORT}`);

  await app.listen();
  logger.log(`gRPC Server running on: ${HOST}:${GRPC_PORT}`);
}

bootstrap();
