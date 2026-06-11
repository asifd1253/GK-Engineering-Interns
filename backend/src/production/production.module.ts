import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductionService } from './production.service';
import { ProductionController } from './production.controller';
import { ProcessStage, ProcessStageSchema } from './schemas/process-stage.schema';
import { Machine, MachineSchema } from './schemas/machine.schema';
import { QualityReason, QualityReasonSchema } from './schemas/quality-reason.schema';
import { Shift, ShiftSchema } from './schemas/shift.schema';
import { Department, DepartmentSchema } from './schemas/department.schema';
import { MachineType, MachineTypeSchema } from './schemas/machine-type.schema';
import { Reason, ReasonSchema } from './schemas/reason.schema';
import { Process, ProcessSchema } from './schemas/process.schema';
import { ProgramMaster, ProgramMasterSchema } from './schemas/program-master.schema';
import { Vendor, VendorSchema } from './schemas/vendor.schema';
import { Operator, OperatorSchema } from './schemas/operator.schema';
import { MaterialMaster, MaterialMasterSchema } from './schemas/material-master.schema';
import { PartMaster, PartMasterSchema } from './schemas/part-master.schema';
import { WorkOrder, WorkOrderSchema } from '../work-order/schemas/work-order.schema';
import { InventoryStock, InventoryStockSchema } from '../inventory/schemas/inventory-stock.schema';
import { RawMaterial, RawMaterialSchema } from '../inventory/schemas/raw-material.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { Device, DeviceSchema } from '../iot/schemas/device.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProcessStage.name, schema: ProcessStageSchema },
      { name: Machine.name, schema: MachineSchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: QualityReason.name, schema: QualityReasonSchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: MachineType.name, schema: MachineTypeSchema },
      { name: Reason.name, schema: ReasonSchema },
      { name: Process.name, schema: ProcessSchema },
      { name: ProgramMaster.name, schema: ProgramMasterSchema },
      { name: Vendor.name, schema: VendorSchema },
      { name: Operator.name, schema: OperatorSchema },
      { name: MaterialMaster.name, schema: MaterialMasterSchema },
      { name: PartMaster.name, schema: PartMasterSchema },
      { name: Device.name, schema: DeviceSchema },
    ]),
    InventoryModule,
    NotificationModule,
  ],
  providers: [ProductionService],
  controllers: [ProductionController],
  exports: [ProductionService],
})
export class ProductionModule {}

