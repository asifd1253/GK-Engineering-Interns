import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkOrderService } from './work-order.service';
import { WorkOrderController } from './work-order.controller';
import { WorkOrder, WorkOrderSchema } from './schemas/work-order.schema';
import { InventoryStock, InventoryStockSchema } from '../inventory/schemas/inventory-stock.schema';
import { ProcessStage, ProcessStageSchema } from '../production/schemas/process-stage.schema';
import { RawMaterial, RawMaterialSchema } from '../inventory/schemas/raw-material.schema';
import { Process, ProcessSchema } from '../production/schemas/process.schema';

import { AcceptancePoint, AcceptancePointSchema } from './schemas/acceptance-point.schema';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    InventoryModule,
    MongooseModule.forFeature([
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: ProcessStage.name, schema: ProcessStageSchema },
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: AcceptancePoint.name, schema: AcceptancePointSchema },
      { name: Process.name, schema: ProcessSchema },
    ]),
  ],
  providers: [WorkOrderService],
  controllers: [WorkOrderController],
  exports: [WorkOrderService],
})
export class WorkOrderModule {}
