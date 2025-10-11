import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared.module';
import { PaymentModule } from './modules/payment/payment.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalGrpcExceptionFilter } from './common/filters/global-grpc-exception.filter';
import { TransformInterceptor } from './common/interceptors/transfrom.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [SharedModule, PaymentModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalGrpcExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
