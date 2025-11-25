import { EventType } from './event.types';

/**
 * Outbox entity matching the database schema
 * Defined as interface to avoid Prisma generation dependency
 */
export interface OutboxEntity {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: any;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  retryCount: number;
  lastError: string | null;
}

/**
 * Typed outbox event with generic payload
 */
export interface TypedOutboxEvent<T = any> {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: EventType;
  payload: T;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  retryCount: number;
  lastError: string | null;
}
