import { Controller, Post, Req } from '@nestjs/common';
import { PaymentService } from '../../services/payment.service';
import { Request } from 'express';
import { PaymentProvider } from '../../enums/provider.enum';

@Controller()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('zalopay/callback')
  async handleZalopayCallback(@Req() req: Request) {
    this.paymentService.handleCallback(PaymentProvider.ZALOPAY, req.body);
  }
}
