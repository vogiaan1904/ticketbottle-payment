import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import * as dotenv from 'dotenv';
import { ISwaggerConfig } from '@/shared/interfaces/swagger-config.interface';
import { Partitioners } from 'kafkajs';

@Injectable()
export class AppConfigService {
  constructor() {
    dotenv.config({
      path: `.env`,
    });

    // Replace \\n with \n to support multiline strings in AWS
    for (const envName of Object.keys(process.env)) {
      process.env[envName] = process.env[envName]?.replace(/\\n/g, '\n');
    }
  }

  public get(key: string): string {
    return process.env[key] || '';
  }

  public getNumber(key: string): number {
    return Number(this.get(key));
  }

  get nodeEnv(): string {
    return this.get('NODE_ENV') || 'development';
  }

  get databaseConfig() {
    return {
      url: this.get('DATABASE_URL'),
      host: this.get('DATABASE_HOST'),
      port: this.getNumber('DATABASE_PORT'),
      name: this.get('DATABASE_NAME'),
      username: this.get('DATABASE_USERNAME'),
      password: this.get('DATABASE_PASSWORD'),
      synchronize: this.get('DATABASE_SYNCHRONIZE'),
      logging: this.get('DATABASE_LOGGING'),
      ssl: this.get('DATABASE_SSL'),
    };
  }

  get kafkaConfig() {
    return {
      client: {
        clientId: this.get('KAFKA_CLIENT_ID') || 'payment-service',
        brokers: (this.get('KAFKA_BROKERS') || 'localhost:9092').split(','),
        connectionTimeout: 3000,
        requestTimeout: 25000,
        retry: {
          initialRetryTime: 100,
          retries: 8,
          maxRetryTime: 30000,
          multiplier: 2,
          factor: 0.2,
        },
        // SSL/SASL configuration for production
        ...(this.get('KAFKA_SSL') === 'true' && {
          ssl: true,
          sasl: {
            mechanism: 'plain' as const,
            username: this.get('KAFKA_USERNAME') || '',
            password: this.get('KAFKA_PASSWORD') || '',
          },
        }),
      },
      producer: {
        createPartitioner: Partitioners.LegacyPartitioner,
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
        idempotent: true,
        maxInFlightRequests: 5,
      },
      consumer: {
        groupId: this.get('KAFKA_CONSUMER_GROUP_ID') || 'payment-consumer-group',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576, // 1MB
        retry: {
          initialRetryTime: 100,
          retries: 8,
          maxRetryTime: 30000,
          multiplier: 2,
        },
      },
    };
  }

  get redisConfig() {
    return {
      url: this.get('REDIS_URL') || 'redis://localhost:6379',
      host: this.get('REDIS_HOST'),
      port: this.getNumber('REDIS_PORT'),
      password: this.get('REDIS_PASSWORD'),
      retryDelayOnFailover: this.getNumber('REDIS_RETRY_DELAY_ON_FAILOVER'),
      enableReadyCheck: this.get('REDIS_ENABLE_READY_CHECK'),
      maxRetriesPerRequest: this.getNumber('REDIS_MAX_RETRIES_PER_REQUEST'),
    };
  }

  get microservicesConfig() {
    return {
      internalKey: this.get('MICROSERVICE_INTERNAL_KEY'),
      transport: {
        tcp: this.get('MICROSERVICES_TRANSPORT_TCP'),
        redis: this.get('MICROSERVICES_TRANSPORT_REDIS'),
        rabbitmq: this.get('MICROSERVICES_TRANSPORT_RABBITMQ'),
      },
      auth: this.get('MICROSERVICES_AUTH'),
      events: this.get('MICROSERVICES_EVENTS'),
      users: this.get('MICROSERVICES_USERS'),
    };
  }

  get swaggerConfig(): ISwaggerConfig {
    return {
      path: this.get('SWAGGER_PATH') || 'docs',
      title: this.get('SWAGGER_TITLE') || 'TicketBottle Event API',
      description: this.get('SWAGGER_DESCRIPTION'),
      version: this.get('SWAGGER_VERSION') || '0.0.1',
      scheme: this.get('SWAGGER_SCHEME') === 'https' ? 'https' : 'http',
    };
  }

  get zalopayConfig() {
    return {
      appID: this.getNumber('ZALOPAY_APP_ID'),
      key1: this.get('ZALOPAY_KEY1'),
      key2: this.get('ZALOPAY_KEY2'),
    };
  }

  get winstonConfig() {
    return {
      transports: [
        new DailyRotateFile({
          level: 'debug',
          filename: `./logs/${this.nodeEnv}/debug-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }),
        new DailyRotateFile({
          level: 'error',
          filename: `./logs/${this.nodeEnv}/error-%DATE%.log`,
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxSize: '20m',
          maxFiles: '30d',
          format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        }),
        new winston.transports.Console({
          level: 'debug',
          handleExceptions: true,
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({
              format: 'DD-MM-YYYY HH:mm:ss',
            }),
            winston.format.printf(({ level, message, timestamp, context, trace }) => {
              const ctx = context ? ` [${context}]` : '';
              const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
              const stackStr = trace ? `\n${trace}` : '';
              return `${timestamp} ${level}:${ctx} ${msgStr}${stackStr}`;
            }),
          ),
        }),
      ],
      exitOnError: false,
    };
  }

  get appConfig() {
    return {
      host: this.get('APP_HOST'),
      name: this.get('APP_NAME'),
      version: this.get('APP_VERSION'),
      port: this.getNumber('APP_PORT'),
      globalPrefix: this.get('APP_GLOBAL_PREFIX'),
      corsOrigins: this.get('APP_CORS_ORIGINS'),
      logLevel: this.get('APP_LOG_LEVEL'),
      initAdminPassword: this.get('APP_INIT_ADMIN_PASSWORD'),
      encryptKey: this.get('ENCRYPT_KEY'),
    };
  }
}
