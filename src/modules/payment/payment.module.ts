import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './controllers/http/payment.controller';
import { PaymentGatewayFactory } from './gateways/gateway.factory';
import { PaymentRepository } from './repository/payment.repository';
import { ZalopayGateWay } from './gateways/zalopay/zalopay.gateway';
import { PrismaModule } from '@/infra/database/prisma/prisma.module';
import { HttpModule } from '@nestjs/axios';
import { GrpcPaymentController } from './controllers/grpc/payment.controller';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [PaymentController, GrpcPaymentController],
  providers: [PaymentService, PaymentGatewayFactory, PaymentRepository, ZalopayGateWay],
})
export class PaymentModule {}
