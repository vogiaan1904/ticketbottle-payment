import { Controller } from '@nestjs/common';
import { PaymentService } from '../../payment.service';
import { LoggerService } from '@/shared/services/logger.service';
import { CreatePaymentIntentResponse, PAYMENT_SERVICE_NAME } from '@/protogen/payment.pb';
import { CreatePaymentIntentDto } from './dto/create-intent.dto';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
export class GrpcPaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly logger: LoggerService,
  ) {
    logger.setContext(GrpcPaymentController.name);
  }

  @GrpcMethod(PAYMENT_SERVICE_NAME, 'createPaymentIntent')
  async createIntent(dto: CreatePaymentIntentDto): Promise<CreatePaymentIntentResponse> {
    this.logger.info(`GrpcPaymentController.createPaymentIntent called.`);
    try {
      const svcDto = dto.toServiceDto();
    } catch (error) {
      console.log(error);
      throw error;
    }

    const url = await this.paymentService.createPaymentIntent(dto.toServiceDto());
    this.logger.info(`GrpcPaymentController.createPaymentIntent completed.`);

    return { paymentUrl: url };
  }
}
