import { Controller, Post, Req } from '@nestjs/common';
import { PaymentService } from '../../payment.service';
import { Request } from 'express';
import { PaymentProvider } from '../../enums/provider.enum';

@Controller('webhook')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('zalopay')
  handleZalopayCallback(@Req() req: Request) {
    this.paymentService.handleCallback(PaymentProvider.ZALOPAY, req.body);
  }
}
