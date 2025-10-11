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

@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly repo: PaymentRepository,
    private readonly logger: LoggerService,
  ) {
    logger.setContext(PaymentService.name);
  }

  private async handleSucessPayment(orderCode: string): Promise<void> {
    //check what type of payment
    //update db
    await this.repo.updateStatus(orderCode, PaymentStatus.COMPLETED);
    //publish event
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
    if (output.success) {
      this.logger.info('Payment success for order: ', output.orderCode);

      // TODO: handle publish kafka payment success event
    } else {
      this.logger.info('Payment failed for order: ', output.orderCode);
      // TODO: handle publish kafka payment failure event
    }

    return output.response;
  }
}
