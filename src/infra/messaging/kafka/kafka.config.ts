import { KafkaOptions, Transport } from '@nestjs/microservices';
import { Partitioners } from 'kafkajs';

export const kafkaConfig = (): KafkaOptions => ({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: process.env.KAFKA_CLIENT_ID || 'payment-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
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
      ...(process.env.KAFKA_SSL === 'true' && {
        ssl: true,
        sasl: {
          mechanism: 'plain',
          username: process.env.KAFKA_USERNAME || '',
          password: process.env.KAFKA_PASSWORD || '',
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
      groupId: process.env.KAFKA_CONSUMER_GROUP_ID || 'payment-consumer-group',
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
  },
});
