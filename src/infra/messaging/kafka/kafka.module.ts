import { Module, Global } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { KafkaService } from './kafka.service';
import { kafkaConfig } from './kafka.config';

@Global() // Makes this module available globally without imports
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        ...kafkaConfig(),
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
