import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { PrismaModule } from '../../infra/database/prisma/prisma.module';
import { KafkaModule } from '../../infra/messaging/kafka/kafka.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, KafkaModule],
  providers: [OutboxService, OutboxPublisherService],
  exports: [OutboxService],
})
export class OutboxModule {}
