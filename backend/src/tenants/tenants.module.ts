import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { UsersModule } from '../users/users.module';
import { Machine, MachineSchema } from '../production/schemas/machine.schema';
import { Device, DeviceSchema } from '../iot/schemas/device.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: Device.name, schema: DeviceSchema }
    ]),
    UsersModule
  ],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class TenantsModule {}
