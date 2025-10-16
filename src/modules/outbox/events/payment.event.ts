export interface PaymentCompletedEvent {
  orderCode: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  provider: string;
  transactionId: string;
  completedAt: string; // ISO 8601 string (e.g., "2025-10-16T12:34:56.789Z")
}

export interface PaymentFailedEvent {
  orderCode: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  provider: string;
  transactionId: string;
  failedAt: string; // ISO 8601 string (e.g., "2025-10-16T12:34:56.789Z")
}
