import { Module } from '@nestjs/common';
import { PaymentModule } from './modules/payment/payment.module';
import { SharedModule } from './shared.module';

/**
 * HTTP Application Module
 * - Webhook callbacks only
 * - Outbox publisher DISABLED (only saves events to DB)
 * - PaymentModule includes OutboxModule with enablePublisher: false
 */
@Module({
  imports: [SharedModule, PaymentModule],
})
export class HttpAppModule {}
