import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Outbox } from '@prisma/client';
import { PrismaService } from '@infra/database/prisma/prisma.service';

export interface OutboxEventPayload {
  [key: string]: any;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save an event to the outbox table
   * Must be called within a transaction context
   */
  async saveEvent(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    payload: OutboxEventPayload,
    tx?: Prisma.TransactionClient,
  ): Promise<Outbox> {
    const prismaClient = tx || this.prisma;

    try {
      const outboxEntry = await prismaClient.outbox.create({
        data: {
          aggregateId,
          aggregateType,
          eventType,
          payload: payload as Prisma.JsonObject,
          published: false,
          retryCount: 0,
        },
      });

      this.logger.debug(`Outbox event saved: ${eventType} for ${aggregateType}:${aggregateId}`);

      return outboxEntry;
    } catch (error) {
      this.logger.error('Failed to save outbox event', error);
      throw error;
    }
  }

  /**
   * Payment-specific: Save payment completed event
   */
  async savePaymentCompletedEvent(payment: any, tx?: Prisma.TransactionClient): Promise<Outbox> {
    return this.saveEvent(
      payment.id,
      'Payment',
      'PaymentCompleted',
      {
        paymentId: payment.id,
        orderCode: payment.orderCode,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provider: payment.provider,
        transactionId: payment.providerTransactionId,
        completedAt: payment.completedAt?.toISOString() || new Date().toISOString(),
      },
      tx,
    );
  }

  /**
   * Payment-specific: Save payment failed event
   */
  async savePaymentFailedEvent(
    payment: any,
    reason: string,
    errorCode?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Outbox> {
    return this.saveEvent(
      payment.id,
      'Payment',
      'PaymentFailed',
      {
        paymentId: payment.id,
        orderCode: payment.orderCode,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provider: payment.provider,
        reason,
        errorCode,
        failedAt: new Date().toISOString(),
      },
      tx,
    );
  }

  /**
   * Payment-specific: Save payment created event
   */
  async savePaymentCreatedEvent(payment: any, tx?: Prisma.TransactionClient): Promise<Outbox> {
    return this.saveEvent(
      payment.id,
      'Payment',
      'PaymentCreated',
      {
        paymentId: payment.id,
        orderCode: payment.orderCode,
        amountCents: payment.amountCents,
        currency: payment.currency,
        provider: payment.provider,
        status: payment.status,
        createdAt: payment.createdAt?.toISOString() || new Date().toISOString(),
      },
      tx,
    );
  }

  /**
   * Get unpublished events for processing
   * Supports pagination and batch processing
   */
  async getUnpublishedEvents(limit: number = 100, maxRetries: number = 5): Promise<Outbox[]> {
    return this.prisma.outbox.findMany({
      where: {
        published: false,
        retryCount: {
          lt: maxRetries,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Mark event as published
   */
  async markAsPublished(id: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        published: true,
        publishedAt: new Date(),
      },
    });

    this.logger.debug(`Outbox event marked as published: ${id}`);
  }

  /**
   * Increment retry count on failure
   */
  async incrementRetryCount(id: string, error: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        retryCount: {
          increment: 1,
        },
        lastError: error.substring(0, 500), // Limit error message length
      },
    });

    this.logger.warn(`Outbox event retry count incremented: ${id}`);
  }

  /**
   * Delete old published events (cleanup)
   * Should be called periodically
   */
  async deleteOldPublishedEvents(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.outbox.deleteMany({
      where: {
        published: true,
        publishedAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Deleted ${result.count} old published events older than ${olderThanDays} days`,
    );

    return result.count;
  }

  /**
   * Get failed events that exceeded max retries
   */
  async getFailedEvents(maxRetries: number = 5): Promise<Outbox[]> {
    return this.prisma.outbox.findMany({
      where: {
        published: false,
        retryCount: {
          gte: maxRetries,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Reset failed event for manual retry
   */
  async resetFailedEvent(id: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        retryCount: 0,
        lastError: null,
      },
    });

    this.logger.log(`Outbox event reset for retry: ${id}`);
  }
}
