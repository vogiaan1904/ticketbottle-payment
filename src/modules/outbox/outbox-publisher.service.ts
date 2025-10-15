import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { KafkaService } from '../../infra/messaging/kafka/kafka.service';
import { KAFKA_TOPICS } from '@/shared/constants/kafka-topic.constant';

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
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Outbox Publisher Service initialized');
    // Start processing immediately on startup
    this.processOutboxEvents();
  }

  async onModuleDestroy() {
    this.logger.log('Outbox Publisher Service shutting down...');
    this.isShuttingDown = true;

    // Wait for current processing to complete
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

      // Process events in parallel with concurrency control
      const results = await Promise.allSettled(events.map((event) => this.publishEvent(event)));

      // Log summary
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

      // Publish to Kafka
      await this.kafkaService.sendMessage(
        topic,
        event.payload,
        event.aggregateId, // Use aggregateId as message key for ordering
        {
          eventType: event.eventType,
          eventVersion: '1.0',
          source: 'payment-service',
          correlationId: event.aggregateId,
        },
      );

      // Mark as published
      await this.outboxService.markAsPublished(event.id);

      this.logger.debug(
        `Event published: ${event.eventType} (${event.aggregateType}:${event.aggregateId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event ${event.id} (attempt ${event.retryCount + 1})`,
        error,
      );

      // Increment retry count
      await this.outboxService.incrementRetryCount(event.id, error.message || 'Unknown error');

      throw error;
    }
  }

  /**
   * Map event types to Kafka topics
   */
  private getTopicForEventType(eventType: string): string | null {
    const mapping: Record<string, string> = {
      PaymentCreated: KAFKA_TOPICS.PAYMENT_CREATED,
      PaymentCompleted: KAFKA_TOPICS.PAYMENT_COMPLETED,
      PaymentFailed: KAFKA_TOPICS.PAYMENT_FAILED,
      PaymentCancelled: KAFKA_TOPICS.PAYMENT_CANCELLED,
      PaymentRefunded: KAFKA_TOPICS.PAYMENT_REFUNDED,
      // Add more mappings as needed
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
