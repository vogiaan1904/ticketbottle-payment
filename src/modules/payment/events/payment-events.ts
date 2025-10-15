export enum PaymentEventType {
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
}

export interface PaymentCompletedEvent {
  orderCode: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  provider: string;
  transactionId: string;
  completedAt: Date;
}

export interface PaymentFailedEvent {
  orderCode: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  provider: string;
  transactionId: string;
  failedAt: Date;
}
