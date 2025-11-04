import { KafkaProducerService } from '@/infra/messaging/kafka/kafka-producer.service';
import { KAFKA_TOPICS } from '@/shared/constants/kafka-topic.constant';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventType } from './enums/event-type.enum';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private isProcessing = false;
  private isShuttingDown = false;

  // Configuration
  private readonly BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 5;
  private readonly PROCESSING_INTERVAL = 5000; // 5 seconds

  constructor(
    private readonly outboxService: OutboxService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Outbox Publisher Service initialized');
  }

  async onModuleDestroy() {
    this.logger.log('Outbox Publisher Service shutting down...');
    this.isShuttingDown = true;

    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.log('Outbox Publisher Service shutdown complete');
  }

  /**
   * Main processing loop - runs every 5 seconds
   * Uses @Cron decorator for scheduled execution
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutboxEvents(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;

    try {
      const events = await this.outboxService.getUnpublishedEvents(
        this.BATCH_SIZE,
        this.MAX_RETRIES,
      );

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Processing ${events.length} outbox events`);

      const results = await Promise.allSettled(events.map((event) => this.publishEvent(event)));
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      this.logger.log(`Batch processing complete: ${succeeded} succeeded, ${failed} failed`);
    } catch (error) {
      this.logger.error('Error in outbox processing loop', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Publish a single event from the outbox to Kafka
   */
  private async publishEvent(event: any): Promise<void> {
    try {
      // Map event type to Kafka topic
      const topic = this.getTopicForEventType(event.eventType);

      if (!topic) {
        this.logger.warn(`Unknown event type: ${event.eventType}, skipping`);
        await this.outboxService.incrementRetryCount(
          event.id,
          `Unknown event type: ${event.eventType}`,
        );
        return;
      }

      await this.kafkaProducer.publish(topic, event.payload, event.aggregateId, {
        eventType: event.eventType,
        eventVersion: '1.0',
        source: 'payment-service',
        correlationId: event.aggregateId,
        messageId: crypto.randomUUID(),
      });

      await this.outboxService.markAsPublished(event.id);

      this.logger.debug(
        `Event published: ${event.eventType} (${event.aggregateType}:${event.aggregateId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event ${event.id} (attempt ${event.retryCount + 1})`,
        error,
      );

      await this.outboxService.incrementRetryCount(event.id, error.message || 'Unknown error');

      throw error;
    }
  }

  /**
   * Map event types to Kafka topics
   */
  private getTopicForEventType(eventType: EventType): string | null {
    const mapping: Record<EventType, string> = {
      [EventType.PAYMENT_COMPLETED]: KAFKA_TOPICS.PAYMENT_COMPLETED,
      [EventType.PAYMENT_FAILED]: KAFKA_TOPICS.PAYMENT_FAILED,
    };

    return mapping[eventType] || null;
  }

  /**
   * Cleanup old published events - runs daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldEvents(): Promise<void> {
    try {
      this.logger.log('Starting cleanup of old published events');
      const deletedCount = await this.outboxService.deleteOldPublishedEvents(7);
      this.logger.log(`Cleanup complete: ${deletedCount} events deleted`);
    } catch (error) {
      this.logger.error('Error during cleanup', error);
    }
  }

  /**
   * Monitor and alert on failed events - runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async monitorFailedEvents(): Promise<void> {
    try {
      const failedEvents = await this.outboxService.getFailedEvents(this.MAX_RETRIES);

      if (failedEvents.length > 0) {
        this.logger.warn(`Found ${failedEvents.length} events that exceeded max retries`, {
          eventIds: failedEvents.map((e) => e.id),
        });

        // TODO: Send alert to monitoring system (Slack, PagerDuty, etc.)
        // await this.alertingService.sendAlert({
        //   severity: 'warning',
        //   message: `${failedEvents.length} outbox events failed after max retries`,
        //   details: failedEvents,
        // });
      }
    } catch (error) {
      this.logger.error('Error monitoring failed events', error);
    }
  }

  /**
   * Manual trigger for processing (useful for testing or admin actions)
   */
  async triggerManualProcessing(): Promise<void> {
    this.logger.log('Manual processing triggered');
    await this.processOutboxEvents();
  }
}
