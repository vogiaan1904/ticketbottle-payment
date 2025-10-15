import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from '@infra/messaging/kafka/kafka.service';
import { KAFKA_TOPICS } from '@shared/constants/kafka-topic.constant';
import { PaymentCompletedEvent, PaymentFailedEvent } from '../events/payment-events';

@Injectable()
export class PaymentEventService {
  private readonly logger = new Logger(PaymentEventService.name);

  constructor(private readonly kafkaService: KafkaService) {}

  /**
   * Publish payment completed event
   */
  async publishPaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    try {
      await this.kafkaService.sendMessage(KAFKA_TOPICS.PAYMENT_COMPLETED, event, event.paymentId, {
        eventType: 'PaymentCompleted',
        eventVersion: '1.0',
        source: 'payment-service',
        correlationId: event.orderCode,
      });

      this.logger.log(`Payment completed event published: ${event.paymentId}`);
    } catch (error) {
      this.logger.error('Failed to publish payment completed event', error);
      throw error;
    }
  }

  /**
   * Publish payment failed event
   */
  async publishPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      await this.kafkaService.sendMessage(KAFKA_TOPICS.PAYMENT_FAILED, event, event.paymentId, {
        eventType: 'PaymentFailed',
        eventVersion: '1.0',
        source: 'payment-service',
        correlationId: event.orderCode,
      });

      this.logger.log(`Payment failed event published: ${event.paymentId}`);
    } catch (error) {
      this.logger.error('Failed to publish payment failed event', error);
      throw error;
    }
  }

  /**
   * Publish multiple payment events in batch
   * Useful for bulk operations or saga patterns
   */
  async publishPaymentBatch(
    events: Array<{
      topic: string;
      data: any;
      paymentId: string;
      orderId: string;
      eventType: string;
    }>,
  ): Promise<void> {
    try {
      const messages = events.map((event) => ({
        data: event.data,
        key: event.paymentId,
        metadata: {
          eventType: event.eventType,
          eventVersion: '1.0',
          source: 'payment-service',
          correlationId: event.orderId,
        },
      }));

      // For multiple topics, we need to group by topic
      const groupedByTopic = events.reduce(
        (acc, event, index) => {
          if (!acc[event.topic]) {
            acc[event.topic] = [];
          }
          acc[event.topic].push(messages[index]);
          return acc;
        },
        {} as Record<string, any[]>,
      );

      // Send each topic's batch
      for (const [topic, topicMessages] of Object.entries(groupedByTopic)) {
        await this.kafkaService.sendBatch(topic, topicMessages);
      }

      this.logger.log(`Batch of ${events.length} payment events published`);
    } catch (error) {
      this.logger.error('Failed to publish payment batch', error);
      throw error;
    }
  }
}
