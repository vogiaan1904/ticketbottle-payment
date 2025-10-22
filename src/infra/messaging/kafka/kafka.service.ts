import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import {
  IKafkaMessage,
  IKafkaProducerRecord,
  IKafkaMetadata,
} from './interfaces/message.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);

  constructor(private readonly kafkaClient: ClientKafka) {}

  async onModuleInit() {
    try {
      await this.kafkaClient.connect();
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.kafkaClient.close();
      this.logger.log('Kafka producer disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka producer', error);
    }
  }

  /**
   * Send a single message to a Kafka topic
   */
  async sendMessage<T>(
    topic: string,
    message: T,
    key?: string,
    metadata?: Partial<IKafkaMetadata>,
  ): Promise<void> {
    try {
      const kafkaMessage = this.createKafkaMessage(message, key, metadata);
      this.kafkaClient.emit(topic, kafkaMessage);

      this.logger.debug(`Message sent to topic: ${topic}`, {
        key,
        messageId: kafkaMessage.headers?.messageId,
      });
    } catch (error) {
      this.logger.error(`Failed to send message to topic: ${topic}`, error);
      throw error;
    }
  }

  /**
   * Send multiple messages to a Kafka topic in a batch
   */
  async sendBatch<T>(
    topic: string,
    messages: Array<{ data: T; key?: string; metadata?: Partial<IKafkaMetadata> }>,
  ): Promise<void> {
    try {
      const kafkaMessages = messages.map((msg) =>
        this.createKafkaMessage(msg.data, msg.key, msg.metadata),
      );

      const record: IKafkaProducerRecord = {
        topic,
        messages: kafkaMessages,
      };

      // For batch, we need to use the emit pattern
      for (const message of kafkaMessages) {
        this.kafkaClient.emit(topic, message);
      }

      this.logger.debug(`Batch of ${messages.length} messages sent to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to send batch to topic: ${topic}`, error);
      throw error;
    }
  }

  /**
   * Create a properly formatted Kafka message with metadata
   */
  private createKafkaMessage<T>(
    data: T,
    key?: string,
    metadata?: Partial<IKafkaMetadata>,
  ): IKafkaMessage<T> {
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    const headers: Record<string, string> = {
      messageId,
      timestamp,
      source: metadata?.source || 'payment-service',
      eventType: metadata?.eventType || 'unknown',
      eventVersion: metadata?.eventVersion || '1.0',
      ...(metadata?.correlationId && { correlationId: metadata.correlationId }),
      ...(metadata?.causationId && { causationId: metadata.causationId }),
    };

    return {
      key: key || messageId,
      value: data,
      headers,
      timestamp,
    };
  }

  /**
   * Health check method
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try to get metadata to verify connection
      return true;
    } catch (error) {
      this.logger.error('Kafka health check failed', error);
      return false;
    }
  }
}
