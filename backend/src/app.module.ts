import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as mongoose from 'mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SharedModule } from './shared/shared.module';
import { UsersModule } from './users/users.module';
import { ConfigModule } from './config/config.module';
import { InventoryModule } from './inventory/inventory.module';
import { WorkOrderModule } from './work-order/work-order.module';
import { ProductionModule } from './production/production.module';
import { QualityModule } from './quality/quality.module';
import { ReportModule } from './report/report.module';
import { NotificationModule } from './notification/notification.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { IotModule } from './iot/iot.module';
import { TenantMiddleware } from './shared/tenant.middleware';
import { LoggerMiddleware } from './shared/logger.middleware';
import { tenantPlugin } from './shared/tenant.plugin';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot('mongodb://localhost:27017/WIMERA_GK', {

    // MongooseModule.forRoot('mongodb://13.126.221.45:27018/WIMERA_GK', {
      connectionFactory: (connection) => {
        connection.plugin(tenantPlugin);
        return connection;
      },
    }),
    SharedModule,
    UsersModule,
    AuthModule,
    ConfigModule,
    InventoryModule,
    WorkOrderModule,
    ProductionModule,
    QualityModule,
    ReportModule,
    NotificationModule,
    TenantsModule,
    IotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
