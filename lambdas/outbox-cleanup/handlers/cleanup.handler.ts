/**
 * Outbox Cleanup Handler
 * Deletes old published events and monitors failed events
 */

import { EventBridgeEvent } from 'aws-lambda';
import { getPrismaClient } from '@/common/database/prisma';
import { logger } from '@/common/logger';
import { getConfig } from '@/common/config';

/**
 * Delete old published events based on retention policy
 * @returns Number of deleted events
 */
const deleteOldEvents = async (): Promise<number> => {
  const config = getConfig();
  const prisma = getPrismaClient();

  const retentionDays = config.outbox.retentionDays;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  logger.info('Deleting old outbox events', {
    retentionDays,
    cutoffDate: cutoffDate.toISOString(),
  });

  try {
    const result = await prisma.outboxEvent.deleteMany({
      where: {
        publishedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
    });

    logger.info('Old outbox events deleted', {
      count: result.count,
      retentionDays,
    });

    return result.count;
  } catch (error) {
    logger.error('Failed to delete old outbox events', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Find events that exceeded retry limit
 * @returns Failed events details
 */
const findFailedEvents = async (): Promise<
  Array<{
    id: string;
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    retryCount: number;
    lastError: string | null;
    createdAt: Date;
  }>
> => {
  const config = getConfig();
  const prisma = getPrismaClient();

  const maxRetries = config.outbox.maxRetries;

  logger.info('Finding failed outbox events', { maxRetries });

  try {
    const failedEvents = await prisma.outboxEvent.findMany({
      where: {
        publishedAt: null,
        retryCount: {
          gte: maxRetries,
        },
      },
      select: {
        id: true,
        aggregateId: true,
        aggregateType: true,
        eventType: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    logger.info('Found failed outbox events', {
      count: failedEvents.length,
    });

    return failedEvents;
  } catch (error) {
    logger.error('Failed to find failed outbox events', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Monitor and alert on failed events
 * @param failedEvents List of failed events
 */
const monitorFailedEvents = async (
  failedEvents: Array<{
    id: string;
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    retryCount: number;
    lastError: string | null;
    createdAt: Date;
  }>
): Promise<void> => {
  if (failedEvents.length === 0) {
    logger.info('No failed events to monitor');
    return;
  }

  // Log failed events for monitoring and alerting
  logger.error('Outbox events exceeded retry limit', {
    count: failedEvents.length,
    events: failedEvents.map((e) => ({
      id: e.id,
      aggregateId: e.aggregateId,
      eventType: e.eventType,
      retryCount: e.retryCount,
      lastError: e.lastError,
      age: Math.floor((Date.now() - e.createdAt.getTime()) / 1000 / 60), // Age in minutes
    })),
  });

  // In production, you would:
  // 1. Send alerts to CloudWatch Alarms
  // 2. Send notifications to SNS topics
  // 3. Create tickets in issue tracking system
  // 4. Send to dead letter queue for manual intervention

  logger.warn(
    `ALERT: ${failedEvents.length} outbox events failed to publish after ${failedEvents[0]?.retryCount} retries. Manual intervention may be required.`
  );
};

/**
 * Get cleanup statistics
 * @returns Cleanup statistics
 */
const getCleanupStats = async (): Promise<{
  totalEvents: number;
  publishedEvents: number;
  pendingEvents: number;
  failedEvents: number;
  oldestPendingAge: number | null;
}> => {
  const config = getConfig();
  const prisma = getPrismaClient();

  try {
    // Get total events count
    const totalEvents = await prisma.outboxEvent.count();

    // Get published events count
    const publishedEvents = await prisma.outboxEvent.count({
      where: {
        publishedAt: { not: null },
      },
    });

    // Get pending events count
    const pendingEvents = await prisma.outboxEvent.count({
      where: {
        publishedAt: null,
        retryCount: { lt: config.outbox.maxRetries },
      },
    });

    // Get failed events count
    const failedEvents = await prisma.outboxEvent.count({
      where: {
        publishedAt: null,
        retryCount: { gte: config.outbox.maxRetries },
      },
    });

    // Get oldest pending event
    const oldestPending = await prisma.outboxEvent.findFirst({
      where: {
        publishedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
      },
    });

    const oldestPendingAge = oldestPending
      ? Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 1000 / 60)
      : null;

    return {
      totalEvents,
      publishedEvents,
      pendingEvents,
      failedEvents,
      oldestPendingAge,
    };
  } catch (error) {
    logger.error('Failed to get cleanup stats', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Perform outbox cleanup operations
 * @returns Cleanup result
 */
export const performCleanup = async (): Promise<{
  deleted: number;
  failedCount: number;
  stats: {
    totalEvents: number;
    publishedEvents: number;
    pendingEvents: number;
    failedEvents: number;
    oldestPendingAge: number | null;
  };
}> => {
  logger.info('Starting outbox cleanup');

  try {
    // Delete old published events
    const deleted = await deleteOldEvents();

    // Find failed events
    const failedEvents = await findFailedEvents();

    // Monitor and alert on failed events
    await monitorFailedEvents(failedEvents);

    // Get cleanup statistics
    const stats = await getCleanupStats();

    logger.info('Outbox cleanup completed', {
      deleted,
      failedCount: failedEvents.length,
      stats,
    });

    return {
      deleted,
      failedCount: failedEvents.length,
      stats,
    };
  } catch (error) {
    logger.error('Outbox cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
};

/**
 * Handle EventBridge scheduled event
 * @param event EventBridge event
 * @returns Cleanup result
 */
export const handleScheduledEvent = async (
  event: EventBridgeEvent<string, any>
): Promise<{ statusCode: number; body: string }> => {
  logger.info('Outbox cleanup triggered by EventBridge', {
    source: event.source,
    detailType: event['detail-type'],
    time: event.time,
  });

  try {
    const result = await performCleanup();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Outbox cleanup completed',
        result,
      }),
    };
  } catch (error) {
    logger.error('Outbox cleanup handler error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Outbox cleanup failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
