/**
 * PayOS Payment Gateway Implementation for Lambda
 * Adapted from main service, removing NestJS dependencies
 */

import PayOS from '@payos/node';
import { logger } from '@/common/logger';
import { getConfig } from '@/common/config';
import {
  PaymentGatewayInterface,
  CreatePaymentLinkInput,
  CreatePaymentLinkOutput,
  HandleCallbackOutput,
} from '../gateway.interface';
import {
  PayOSCreatePaymentLinkRequestBody,
  PayOSWebhookBody,
  PayOSWebhookData,
} from './payos.interface';

export class PayOSGateway implements PaymentGatewayInterface {
  private readonly payOS: any;
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly checksumKey: string;

  constructor() {
    const config = getConfig();
    this.clientId = config.paymentProviders.payos.clientId;
    this.apiKey = config.paymentProviders.payos.apiKey;
    this.checksumKey = config.paymentProviders.payos.checksumKey;

    this.payOS = new (PayOS as any)(this.clientId, this.apiKey, this.checksumKey);

    logger.info('PayOS Gateway initialized', {
      clientId: this.clientId,
    });
  }

  /**
   * Create payment link with PayOS
   * @param input Payment link creation input
   * @returns Payment link URL and transaction ID
   */
  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkOutput> {
    try {
      logger.info('Creating PayOS payment link', {
        orderCode: input.orderCode,
        amount: input.amount,
      });

      // Convert order code to numeric format
      // Format: current date (YYMMDD) * 100000000 + alphanumeric conversion of orderCode
      const numericOrderCode = this.convertOrderCodeToNumber(input.orderCode);

      const requestBody: PayOSCreatePaymentLinkRequestBody = {
        orderCode: numericOrderCode,
        amount: input.amount,
        description: `Payment for order ${input.orderCode}`,
        cancelUrl: input.redirectUrl,
        returnUrl: input.redirectUrl,
        expiredAt: Math.floor(Date.now() / 1000) + input.timeoutSeconds,
      };

      logger.debug('PayOS request body', requestBody);

      const response = await this.payOS.createPaymentLink(requestBody);

      logger.info('PayOS payment link created successfully', {
        orderCode: input.orderCode,
        paymentLinkId: response.paymentLinkId,
        checkoutUrl: response.checkoutUrl,
      });

      return {
        url: response.checkoutUrl,
        transactionId: response.paymentLinkId,
      };
    } catch (error) {
      logger.error('Failed to create PayOS payment link', {
        orderCode: input.orderCode,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle PayOS webhook callback
   * @param body Webhook body from PayOS
   * @returns Callback processing result
   */
  async handleCallback(body: PayOSWebhookBody): Promise<HandleCallbackOutput> {
    try {
      logger.info('Processing PayOS webhook', {
        orderCode: body.data?.orderCode,
        code: body.code,
      });

      // Verify webhook signature using PayOS SDK
      // The SDK automatically verifies the signature when we call verifyPaymentWebhookData
      const webhookData: PayOSWebhookData = await this.payOS.verifyPaymentWebhookData(body);

      logger.debug('PayOS webhook signature verified', {
        orderCode: webhookData.orderCode,
        paymentLinkId: webhookData.paymentLinkId,
      });

      // Check if payment was successful
      // PayOS uses code '00' for successful payments
      const isSuccess = webhookData.code === '00';

      if (!isSuccess) {
        logger.warn('PayOS payment not successful', {
          orderCode: webhookData.orderCode,
          code: webhookData.code,
          description: webhookData.desc,
        });

        return {
          success: false,
          response: this.initPayOSCallbackRes(-1, webhookData.desc || 'Payment failed'),
          providerTransactionId: webhookData.paymentLinkId,
        };
      }

      logger.info('PayOS payment successful', {
        orderCode: webhookData.orderCode,
        amount: webhookData.amount,
        paymentLinkId: webhookData.paymentLinkId,
      });

      return {
        success: true,
        response: this.initPayOSCallbackRes(0, 'Success'),
        providerTransactionId: webhookData.paymentLinkId,
      };
    } catch (error) {
      logger.error('Failed to process PayOS webhook', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        response: this.initPayOSCallbackRes(-1, 'Invalid signature or webhook data'),
      };
    }
  }

  /**
   * Convert alphanumeric order code to numeric format required by PayOS
   * Format: YYMMDD * 100000000 + numeric conversion of order code
   * @param orderCode Original order code
   * @returns Numeric order code
   */
  private convertOrderCodeToNumber(orderCode: string): number {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePrefix = parseInt(`${year}${month}${day}`);

    // Convert order code to number by taking last 8 digits or converting alphanumeric
    let numericSuffix = 0;

    // Try to extract numeric part from order code
    const numericPart = orderCode.replace(/\D/g, '');
    if (numericPart.length > 0) {
      // Take last 8 digits to ensure it fits within the range
      numericSuffix = parseInt(numericPart.slice(-8)) % 100000000;
    } else {
      // If no numeric part, convert characters to numbers
      for (let i = 0; i < orderCode.length && i < 8; i++) {
        numericSuffix = (numericSuffix * 10 + orderCode.charCodeAt(i)) % 100000000;
      }
    }

    const result = datePrefix * 100000000 + numericSuffix;

    logger.debug('Converted order code to PayOS format', {
      originalOrderCode: orderCode,
      datePrefix,
      numericSuffix,
      result,
    });

    return result;
  }

  /**
   * Initialize PayOS callback response
   * @param error Error code (0 for success, -1 for failure)
   * @param message Response message
   * @returns PayOS webhook response
   */
  private initPayOSCallbackRes(error: number, message: string): any {
    return {
      error,
      message,
      data: null,
    };
  }
}
