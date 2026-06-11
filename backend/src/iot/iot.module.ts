import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IotController } from './iot.controller';
import { DeviceApiController } from './device-api.controller';
import { IotService } from './iot.service';
import { HourData, HourDataSchema } from './schemas/hourdata.schema';
import { EquipmentAgg, EquipmentAggSchema } from './schemas/equipmentagg.schema';
import { Device, DeviceSchema } from './schemas/device.schema';
import { OTAConfig, OTAConfigSchema } from './schemas/ota-config.schema';
import { DeviceGateway, DeviceGatewaySchema } from './schemas/device-gateway.schema';
import { ProcessStage, ProcessStageSchema } from '../production/schemas/process-stage.schema';
import { Shift, ShiftSchema } from '../production/schemas/shift.schema';
import { WorkOrder, WorkOrderSchema } from '../work-order/schemas/work-order.schema';
const IOT_DB_URI =
'mongodb://localhost:27017/WIMERA_GK?retryWrites=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000';

// const IOT_DB_URI =
//   'mongodb://13.126.221.45:27018/WIMERA_GK?retryWrites=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=10000';

@Module({
  imports: [
    MongooseModule.forRoot(IOT_DB_URI, { connectionName: 'iot' }),
    MongooseModule.forFeature(
      [
        { name: HourData.name, schema: HourDataSchema },
        { name: EquipmentAgg.name, schema: EquipmentAggSchema },
        { name: OTAConfig.name, schema: OTAConfigSchema },
      ],
      'iot',
    ),
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: OTAConfig.name, schema: OTAConfigSchema },
      { name: DeviceGateway.name, schema: DeviceGatewaySchema },
      { name: ProcessStage.name, schema: ProcessStageSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
    ]),
  ],
  controllers: [IotController, DeviceApiController],
  providers: [IotService],
  exports: [IotService],
})
export class IotModule { }
