/**
 * Payment entity interface
 * Mirrors Prisma schema but defined here to avoid Prisma generation dependency during development
 */
export interface PaymentEntity {
  id: string;
  orderCode: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerTransactionId: string | null;
  idempotencyKey: string;
  redirectUrl: string;
  paymentUrl: string;
  status: PaymentStatus;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
}

/**
 * Payment provider enum
 */
export enum PaymentProvider {
  ZALOPAY = 'ZALOPAY',
  PAYOS = 'PAYOS',
  VNPAY = 'VNPAY',
}

/**
 * Payment status enum
 * Must match Prisma schema enum values exactly
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
