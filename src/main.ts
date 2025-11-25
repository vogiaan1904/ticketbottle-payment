import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LoggerService } from '@shared/services/logger.service';
import { GrpcAppModule } from './grpc-app.module';
import { RpcValidationException } from './common/exceptions/rpc-validation.exception';
import { PAYMENT_PACKAGE_NAME } from './protogen/payment.pb';
import { join } from 'path';

/**
 * Payment Service - gRPC Only
 *
 * HTTP webhook endpoints have been migrated to AWS Lambda.
 * See: aws/lambda/payment-webhook-handler/
 *
 * Outbox publishing has been migrated to AWS Lambda.
 * See: aws/lambda/outbox-processor/
 */
async function bootstrap() {
  const HOST = '0.0.0.0';
  const GRPC_PORT = process.env.GRPC_PORT || '50055';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(GrpcAppModule, {
    transport: Transport.GRPC,
    options: {
      url: `${HOST}:${GRPC_PORT}`,
      package: PAYMENT_PACKAGE_NAME,
      protoPath: join(__dirname, 'protos', 'payment.proto'),
    },
  });

  const logger = app.get(LoggerService);
  app.useLogger(logger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        throw new RpcValidationException('Validation failed', errors);
      },
    }),
  );

  await app.listen();
  logger.log(`gRPC Server running on: ${HOST}:${GRPC_PORT}`);
}

bootstrap();
