import { Module } from '@nestjs/common';
import { PaymentModule } from './modules/payment/payment.module';
import { SharedModule } from './shared.module';

@Module({
  imports: [SharedModule, PaymentModule],
})
export class HttpAppModule {}
