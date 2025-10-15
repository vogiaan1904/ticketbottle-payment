import { AppConfigService } from '@/shared/services/config.service';
import { Global, Module } from '@nestjs/common';
import { ClientsModule, KafkaOptions, Transport } from '@nestjs/microservices';
import { KafkaService } from './kafka.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        useFactory: (configService: AppConfigService): KafkaOptions => {
          return {
            transport: Transport.KAFKA,
            options: {
              ...configService.kafkaConfig,
            },
          };
        },
        inject: [AppConfigService],
      },
    ]),
  ],
  providers: [
    {
      provide: KafkaService,
      useFactory: (kafkaClient) => {
        return new KafkaService(kafkaClient);
      },
      inject: ['KAFKA_SERVICE'],
    },
  ],
  exports: [KafkaService],
})
export class KafkaModule {}
