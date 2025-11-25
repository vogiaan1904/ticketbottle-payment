/**
 * Outbox Processor Handler
 * Polls outbox events and publishes them to Kafka
 */

import { EventBridgeEvent } from 'aws-lambda';
import { getPrismaClient } from '@/common/database/prisma';
import { getKafkaProducer, publishWithRetry } from '@/common/kafka/producer';
import { logger } from '@/common/logger';
import { getConfig } from '@/common/config';
import { OutboxEntity } from '@/common/types/outbox.types';
import { EventType } from '@/common/types/event.types';
import { KAFKA_TOPICS } from '@/common/constants/kafka-topics';

/**
 * Get Kafka topic for event type
 * @param eventType Event type
 * @returns Kafka topic name
 */
const getTopicForEventType = (eventType: EventType): string => {
  switch (eventType) {
    case EventType.PAYMENT_COMPLETED:
    case EventType.PAYMENT_FAILED:
    case EventType.PAYMENT_CANCELLED:
      return KAFKA_TOPICS.PAYMENT_EVENTS;
    default:
      logger.warn('Unknown event type, using default topic', { eventType });
      return KAFKA_TOPICS.PAYMENT_EVENTS;
  }
};

/**
 * Process a single outbox event
 * @param event Outbox event to process
 * @returns Success status
 */
const processOutboxEvent = async (event: OutboxEntity): Promise<boolean> => {
  try {
    logger.info('Processing outbox event', {
      id: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });

    // Get Kafka topic
    const topic = getTopicForEventType(event.eventType as EventType);

    // Publish event to Kafka with retry
    const metadata = await publishWithRetry(
      topic,
      event.payload,
      event.aggregateId, // Use aggregateId as partition key
      {
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        eventId: event.id,
      }
    );

    logger.info('Outbox event published to Kafka', {
      id: event.id,
      eventType: event.eventType,
      topic,
      partition: metadata[0].partition,
      offset: metadata[0].offset,
    });

    return true;
  } catch (error) {
    logger.error('Failed to process outbox event', {
      id: event.id,
      eventType: event.eventType,
      error: error instanceof Error ? error.message : String(error),
    });

    return false;
  }
};

/**
 * Update outbox event status after processing
 * @param eventId Event ID
 * @param success Whether processing succeeded
 * @param error Optional error message
 */
const updateOutboxEvent = async (
  eventId: string,
  success: boolean,
  error?: string
): Promise<void> => {
  const prisma = getPrismaClient();

  if (success) {
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        publishedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.debug('Outbox event marked as published', { eventId });
  } else {
    await prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        retryCount: { increment: 1 },
        lastError: error || 'Unknown error',
        updatedAt: new Date(),
      },
    });

    logger.debug('Outbox event retry count incremented', { eventId });
  }
};

/**
 * Process outbox events in batch
 * @returns Processing result
 */
export const processOutbox = async (): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> => {
  const config = getConfig();
  const prisma = getPrismaClient();

  const batchSize = config.outbox.batchSize;
  const maxRetries = config.outbox.maxRetries;

  logger.info('Starting outbox processing', {
    batchSize,
    maxRetries,
  });

  try {
    // Connect Kafka producer if not already connected
    const producer = getKafkaProducer();
    await producer.connect();

    // Fetch pending events from outbox
    // Only fetch events that haven't been published and haven't exceeded retry limit
    const pendingEvents = await prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
        retryCount: { lt: maxRetries },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: batchSize,
    });

    logger.info('Fetched pending outbox events', {
      count: pendingEvents.length,
    });

    if (pendingEvents.length === 0) {
      logger.info('No pending outbox events to process');
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
      };
    }

    // Process events sequentially to maintain order within aggregates
    let succeeded = 0;
    let failed = 0;

    for (const event of pendingEvents) {
      const success = await processOutboxEvent(event);

      try {
        await updateOutboxEvent(
          event.id,
          success,
          success ? undefined : 'Failed to publish to Kafka'
        );

        if (success) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (error) {
        logger.error('Failed to update outbox event status', {
          eventId: event.id,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    logger.info('Outbox processing completed', {
      processed: pendingEvents.length,
      succeeded,
      failed,
    });

    return {
      processed: pendingEvents.length,
      succeeded,
      failed,
    };
  } catch (error) {
    logger.error('Outbox processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Handle EventBridge scheduled event
 * @param event EventBridge event
 * @returns Processing result
 */
export const handleScheduledEvent = async (
  event: EventBridgeEvent<string, any>
): Promise<{ statusCode: number; body: string }> => {
  logger.info('Outbox processor triggered by EventBridge', {
    source: event.source,
    detailType: event['detail-type'],
    time: event.time,
  });

  try {
    const result = await processOutbox();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Outbox processing completed',
        result,
      }),
    };
  } catch (error) {
    logger.error('Outbox processor handler error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Outbox processing failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
