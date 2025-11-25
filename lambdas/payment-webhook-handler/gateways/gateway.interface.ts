/**
 * Payment gateway interface for Lambda functions
 * Adapted from main service, removing NestJS dependencies
 */

export class CreatePaymentLinkInput {
  amount: number;
  orderCode: string;
  currency: string;
  idempotencyKey: string;
  redirectUrl: string;
  timeoutSeconds: number;
}

export interface HandleCallbackOutput {
  success: boolean;
  response: any;
  providerTransactionId?: string;
}

export interface CreatePaymentLinkOutput {
  url: string;
  transactionId: string;
}

export interface PaymentGatewayInterface {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkOutput>;
  handleCallback(body: any): Promise<HandleCallbackOutput>;
}
