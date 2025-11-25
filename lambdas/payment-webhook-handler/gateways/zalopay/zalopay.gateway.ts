import axios from 'axios';
import * as crypto from 'crypto';
import dayjs from 'dayjs';
import { logger } from '@/common/logger';
import { getConfig } from '@/common/config';
import { PaymentProviderError } from '@/common/utils/error-handler';
import {
  CreatePaymentLinkInput,
  CreatePaymentLinkOutput,
  HandleCallbackOutput,
  PaymentGatewayInterface,
} from '../gateway.interface';
import {
  ZaloCreatePaymentUrlRequestBody,
  ZaloCreatePaymentUrlResponse,
  ZalopayCallbackBody,
  ZalopayCallbackData,
  ZalopayCallbackResponse,
} from './zalopay.interface';

/**
 * ZaloPay payment gateway implementation for Lambda
 * Adapted from NestJS service, using plain TypeScript
 */
export class ZalopayGateway implements PaymentGatewayInterface {
  private readonly ORDER_TIMEOUT_SECONDS = 300; // 5 minutes
  private readonly CREATE_ZALOPAY_PAYMENT_LINK_URL = 'https://sb-openapi.zalopay.vn/v2/create';
  private readonly callbackErrorCode = -1;

  private readonly appID: number;
  private readonly key1: string;
  private readonly key2: string;

  constructor() {
    const config = getConfig();
    this.appID = parseInt(config.paymentProviders.zalopay.appId, 10);
    this.key1 = config.paymentProviders.zalopay.key1;
    this.key2 = config.paymentProviders.zalopay.key2;

    logger.info('ZaloPay gateway initialized', { appID: this.appID });
  }

  /**
   * Build ZaloPay app_trans_id in format YYMMDD_orderCode
   * @param orderCode Order code
   * @returns app_trans_id string
   */
  private buildZaloPayAppTransId(orderCode: string): string {
    const now = dayjs();
    return `${now.format('YYMMDD')}_${orderCode}`;
  }

  /**
   * Extract order code from app_trans_id
   * @param appTransId ZaloPay app_trans_id
   * @returns Order code
   */
  private getOrderCodeFromAppTransId(appTransId: string): string {
    const parts = appTransId.split('_');
    if (parts.length !== 2) {
      throw new Error('Invalid app_trans_id format');
    }
    return parts[1];
  }

  /**
   * Initialize ZaloPay callback response
   * @param code Return code
   * @param message Return message
   * @returns Callback response object
   */
  private initZaloPayCallbackRes(code: number, message: string): ZalopayCallbackResponse {
    return {
      return_code: code,
      return_message: message,
    };
  }

  /**
   * Initialize ZaloPay request body with MAC signature
   * @param data Payment link input
   * @returns ZaloPay request body
   */
  private initZaloPayRequestBody(data: CreatePaymentLinkInput): ZaloCreatePaymentUrlRequestBody {
    const now = dayjs();
    const appTransId = this.buildZaloPayAppTransId(data.orderCode);

    // Append orderCode to redirect URL
    let redirectUrl = data.redirectUrl;
    if (redirectUrl.includes('?')) {
      redirectUrl += `&bookingCode=${data.orderCode}`;
    } else {
      redirectUrl += `?bookingCode=${data.orderCode}`;
    }

    // In Lambda, we'll use the API Gateway URL for callbacks
    // This will be set via environment variable
    const callbackUrl = process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL}/webhook/zalopay`
      : 'https://api.ticketbottle.com/webhook/zalopay';

    const body: ZaloCreatePaymentUrlRequestBody = {
      app_id: this.appID,
      app_user: 'TicketBottle',
      app_time: now.valueOf(),
      amount: data.amount,
      app_trans_id: appTransId,
      embed_data: JSON.stringify({
        redirecturl: redirectUrl,
      }),
      expire_duration_seconds: data.timeoutSeconds || this.ORDER_TIMEOUT_SECONDS,
      description: 'Payment for order ' + data.orderCode,
      bank_code: '',
      callback_url: callbackUrl,
      item: JSON.stringify([]),
      mac: '',
    };

    // Generate MAC signature
    const macInput =
      body.app_id +
      '|' +
      body.app_trans_id +
      '|' +
      body.app_user +
      '|' +
      body.amount +
      '|' +
      body.app_time +
      '|' +
      body.embed_data +
      '|' +
      body.item;

    body.mac = crypto.createHmac('sha256', this.key1).update(macInput).digest('hex');

    return body;
  }

  /**
   * Create ZaloPay payment link
   * @param input Payment link input data
   * @returns Payment URL and transaction ID
   */
  async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkOutput> {
    try {
      const body = this.initZaloPayRequestBody(input);

      logger.info('Creating ZaloPay payment link', {
        orderCode: input.orderCode,
        amount: input.amount,
      });

      const response = await axios.post<ZaloCreatePaymentUrlResponse>(
        this.CREATE_ZALOPAY_PAYMENT_LINK_URL,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const resData = response.data;

      if (resData.return_code !== 1) {
        logger.error('ZaloPay payment link creation failed', {
          returnCode: resData.return_code,
          returnMessage: resData.return_message,
          subReturnCode: resData.sub_return_code,
          subReturnMessage: resData.sub_return_message,
        });
        throw new PaymentProviderError(
          `ZaloPay error: ${resData.return_message}`,
          'ZALOPAY',
          resData
        );
      }

      logger.info('ZaloPay payment link created successfully', {
        transactionId: body.app_trans_id,
      });

      return {
        url: resData.order_url,
        transactionId: body.app_trans_id,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        throw error;
      }

      logger.error('Error creating ZaloPay payment link', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderCode: input.orderCode,
      });

      throw new PaymentProviderError(
        'Failed to create ZaloPay payment link',
        'ZALOPAY',
        error
      );
    }
  }

  /**
   * Handle ZaloPay webhook callback
   * @param callbackBody Callback request body
   * @returns Callback processing result
   */
  async handleCallback(callbackBody: ZalopayCallbackBody): Promise<HandleCallbackOutput> {
    try {
      logger.info('Processing ZaloPay callback');

      // Verify MAC signature
      const requestMac = crypto
        .createHmac('sha256', this.key2)
        .update(callbackBody.data)
        .digest('hex');

      if (requestMac !== callbackBody.mac) {
        logger.warn('Invalid MAC signature in ZaloPay callback', {
          receivedMac: callbackBody.mac,
          expectedMac: requestMac,
        });

        return {
          success: false,
          response: this.initZaloPayCallbackRes(this.callbackErrorCode, 'Invalid mac'),
        };
      }

      // Parse callback data
      const transData: ZalopayCallbackData = JSON.parse(callbackBody.data);

      // Only support Order type (type 1)
      if (callbackBody.type !== 1) {
        logger.warn(`Unsupported ZaloPay callback type: ${callbackBody.type}`);
        return {
          success: false,
          response: this.initZaloPayCallbackRes(
            this.callbackErrorCode,
            'Unsupported callback type'
          ),
        };
      }

      const appTransId = transData.app_trans_id;
      const orderCode = this.getOrderCodeFromAppTransId(appTransId);

      logger.info('ZaloPay callback processed successfully', {
        appTransId,
        orderCode,
        amount: transData.amount,
        zpTransId: transData.zp_trans_id,
      });

      return {
        success: true,
        response: this.initZaloPayCallbackRes(1, 'Success'),
        providerTransactionId: appTransId,
      };
    } catch (error) {
      logger.error('Error processing ZaloPay callback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return {
        success: false,
        response: this.initZaloPayCallbackRes(this.callbackErrorCode, 'Processing error'),
      };
    }
  }
}
