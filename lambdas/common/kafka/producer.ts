import { Kafka, Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
import { logger } from '../logger';

/**
 * Singleton Kafka producer for Lambda reuse
 * Reuses connection across Lambda invocations
 */
let producer: Producer | null = null;
let isConnected = false;

/**
 * Get or create Kafka producer instance
 * @returns Connected Kafka Producer
 */
export const getKafkaProducer = async (): Promise<Producer> => {
  if (!producer || !isConnected) {
    logger.info('Initializing Kafka producer');

    const brokers = process.env.KAFKA_BROKERS?.split(',').map((b) => b.trim()) || [];
    if (brokers.length === 0) {
      throw new Error('KAFKA_BROKERS environment variable is required');
    }

    const kafka = new Kafka({
      clientId: 'payment-lambda',
      brokers,
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_USERNAME
        ? {
            mechanism: 'plain',
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD || '',
          }
        : undefined,
      connectionTimeout: 3000,
      requestTimeout: 25000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2,
      },
    });

    producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionTimeout: 30000,
    });

    try {
      await producer.connect();
      isConnected = true;
      logger.info('Kafka producer connected successfully');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error });
      producer = null;
      isConnected = false;
      throw error;
    }
  }

  return producer;
};

/**
 * Publish a message to Kafka with metadata headers
 * @param topic Kafka topic name
 * @param value Message payload
 * @param key Optional partition key (for ordering)
 * @param headers Optional message headers
 * @returns Record metadata with partition and offset
 */
export const publishToKafka = async <T = any>(
  topic: string,
  value: T,
  key?: string,
  headers?: Record<string, string>,
): Promise<RecordMetadata[]> => {
  const producer = await getKafkaProducer();

  const record: ProducerRecord = {
    topic,
    acks: -1, // Wait for all in-sync replicas
    timeout: 30000,
    messages: [
      {
        key: key ? Buffer.from(key) : undefined,
        value: Buffer.from(JSON.stringify(value)),
        headers: headers
          ? Object.entries(headers).reduce(
              (acc, [k, v]) => {
                acc[k] = Buffer.from(v);
                return acc;
              },
              {} as Record<string, Buffer>,
            )
          : undefined,
      },
    ],
  };

  logger.debug('Publishing message to Kafka', { topic, key, headers });

  try {
    const metadata = await producer.send(record);
    logger.info('Message published to Kafka', {
      topic,
      partition: metadata[0].partition,
      offset: metadata[0].baseOffset,
    });
    return metadata;
  } catch (error) {
    logger.error('Failed to publish message to Kafka', { topic, error });
    throw error;
  }
};

/**
 * Disconnect Kafka producer (use sparingly in Lambda)
 * Lambda execution context keeps connections warm
 */
export const disconnectKafka = async (): Promise<void> => {
  if (producer && isConnected) {
    logger.info('Disconnecting Kafka producer');
    await producer.disconnect();
    producer = null;
    isConnected = false;
  }
};

/**
 * Publish message with automatic retry on transient failures
 * @param topic Kafka topic
 * @param value Message payload
 * @param key Optional partition key
 * @param headers Optional headers
 * @param maxRetries Maximum number of retries (default: 3)
 * @returns Record metadata
 */
export const publishWithRetry = async <T = any>(
  topic: string,
  value: T,
  key?: string,
  headers?: Record<string, string>,
  maxRetries: number = 3,
): Promise<RecordMetadata[]> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await publishToKafka(topic, value, key, headers);
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Kafka publish attempt ${attempt}/${maxRetries} failed`, {
        topic,
        error: (error as Error).message,
      });

      if (attempt < maxRetries) {
        // Exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw new Error(`Failed to publish to Kafka after ${maxRetries} attempts: ${lastError?.message}`);
};

// Export Kafka types for convenience
export type { Producer, ProducerRecord, RecordMetadata } from 'kafkajs';
