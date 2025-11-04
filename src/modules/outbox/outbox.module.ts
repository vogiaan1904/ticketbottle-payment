import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { OutboxPublisherService } from './outbox-publisher.service';
import { PrismaModule } from '../../infra/database/prisma/prisma.module';
import { KafkaModule } from '../../infra/messaging/kafka/kafka.module';

export interface OutboxModuleOptions {
  enablePublisher?: boolean;
}

@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions = {}): DynamicModule {
    const { enablePublisher = false } = options;

    const providers: any[] = [OutboxService];
    const imports: any[] = [PrismaModule];

    // Only include publisher and its dependencies when explicitly enabled
    if (enablePublisher) {
      imports.push(ScheduleModule.forRoot(), KafkaModule.forRootAsync());
      providers.push(OutboxPublisherService);
    }

    return {
      module: OutboxModule,
      imports,
      providers,
      exports: [OutboxService],
    };
  }
}
