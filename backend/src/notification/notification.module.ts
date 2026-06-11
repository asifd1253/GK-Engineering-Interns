import { Module } from '@nestjs/common';
import { NotificationController } from '../shared/notification.controller';
import { NotificationService } from '../shared/notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
