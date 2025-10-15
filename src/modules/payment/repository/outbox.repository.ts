import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/database/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateOutboxMessageDto {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: any;
}

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an outbox message within a transaction
   * This ensures atomicity with business logic
   */
  async create(dto: CreateOutboxMessageDto, tx?: Prisma.TransactionClient) {
    const prismaClient = tx || this.prisma;

    return prismaClient.outbox.create({
      data: {
        aggregateId: dto.aggregateId,
        aggregateType: dto.aggregateType,
        eventType: dto.eventType,
        payload: dto.payload,
      },
    });
  }

  /**
   * Get unpublished messages for the background worker
   */
  async getUnpublished(limit: number = 100) {
    return this.prisma.outbox.findMany({
      where: {
        published: false,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Mark message as published
   */
  async markAsPublished(id: string) {
    return this.prisma.outbox.update({
      where: { id },
      data: {
        published: true,
        publishedAt: new Date(),
      },
    });
  }

  /**
   * Update retry count and last error
   */
  async updateRetry(id: string, error: string) {
    return this.prisma.outbox.update({
      where: { id },
      data: {
        retryCount: {
          increment: 1,
        },
        lastError: error,
      },
    });
  }

  /**
   * Delete old published messages (cleanup)
   */
  async deletePublished(olderThanDays: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return this.prisma.outbox.deleteMany({
      where: {
        published: true,
        publishedAt: {
          lt: cutoffDate,
        },
      },
    });
  }
}
