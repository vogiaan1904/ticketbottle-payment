import { Injectable } from '@nestjs/common';
import { CreatePaymentIntentDto } from './dto';
import { PaymentProvider } from './enums/provider.enum';
import { PaymentGatewayFactory } from './gateways/gateway.factory';
import { PaymentRepository } from './repository/payment.repository';
import { PaymentEntity } from './entities/payment.entity';
import { RpcBusinessException } from '@/common/exceptions/rpc-business.exception';
import { ErrorCodeEnum } from '@/shared/constants/error-code.constant';
import { LoggerService } from '@/shared/services/logger.service';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '@/infra/database/prisma/prisma.service';
import { OutboxService } from '@/modules/outbox/outbox.service';

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly repo: PaymentRepository,
    private readonly outboxService: OutboxService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    logger.setContext(PaymentService.name);
  }

  /**
   * Handle successful payment using Outbox Pattern
   * Updates payment status and saves event to outbox in a single transaction
   */
  private async handleSuccessPayment(orderCode: string): Promise<void> {
    const now = new Date();
    const payment = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { orderCode },
        data: { status: PaymentStatus.COMPLETED, completedAt: now },
      });

      await this.outboxService.savePaymentCompletedEvent(payment, tx);

      return payment;
    });

    this.logger.info(`Payment completed for order: ${orderCode}`);
  }

  private async handleFailedPayment(
    orderCode: string,
    reason?: string,
    errorCode?: string,
  ): Promise<void> {
    try {
      const now = new Date();

      const payment = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.update({
          where: { orderCode },
          data: {
            status: PaymentStatus.FAILED,
            failedAt: now,
          },
        });

        await this.outboxService.savePaymentFailedEvent(payment, errorCode, tx);

        return payment;
      });

      this.logger.log(`Payment failed for order: ${orderCode}`);
    } catch (error) {
      this.logger.error(`Failed to handle failed payment for order: ${orderCode}`, error);
      throw error;
    }
    this.logger.info(`Payment failed for order: ${orderCode}`);
  }

  async cancelPayment(orderCode: string): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.update({
          where: { orderCode },
          data: {
            status: PaymentStatus.CANCELLED,
            cancelledAt: now,
          },
        });

        await this.outboxService.saveEvent(
          payment.id,
          'Payment',
          'PaymentCancelled',
          {
            paymentId: payment.id,
            orderCode: payment.orderCode,
            cancelledAt: now.toISOString(),
          },
          tx,
        );

        return payment;
      });

      this.logger.log(`Payment cancelled for order: ${orderCode}`);
    } catch (error) {
      this.logger.error(`Failed to cancel payment for order: ${orderCode}`, error);
      throw error;
    }
  }

  async createPaymentIntent(dto: CreatePaymentIntentDto): Promise<string> {
    const gateway = this.paymentGatewayFactory.getGateway(dto.provider);
    const { url, transactionId } = await gateway.createPaymentLink({
      amount: dto.amountCents,
      orderCode: dto.orderCode,
      currency: dto.currency,
      idempotencyKey: dto.idempotencyKey,
      redirectUrl: dto.redirectUrl,
      timeoutSeconds: dto.timeoutSeconds,
    });

    dto.transactionId = transactionId;
    await this.repo.create(dto);

    return url;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentEntity> {
    const payment = await this.repo.findByIdentempotencyKey(idempotencyKey);
    if (!payment) throw new RpcBusinessException(ErrorCodeEnum.PermissionDenied);

    return payment;
  }

  async handleCallback(provider: PaymentProvider, callbackBody: any) {
    const gateway = this.paymentGatewayFactory.getGateway(provider);

    const output = await gateway.handleCallback(callbackBody);

    if (!output.orderCode) {
      this.logger.error('Callback handling failed');
    } else if (output.success) {
      await this.handleSuccessPayment(output.orderCode);
    } else {
      await this.handleFailedPayment(output.orderCode, 'Callback indicated failure');
    }

    return output.response;
  }
}
