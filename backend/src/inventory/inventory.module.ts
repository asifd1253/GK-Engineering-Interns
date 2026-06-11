import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { RawMaterial, RawMaterialSchema } from './schemas/raw-material.schema';
import { InventoryStock, InventoryStockSchema } from './schemas/inventory-stock.schema';
import { MonthlySchedule, MonthlyScheduleSchema } from './schemas/monthly-schedule.schema';
import { PartInventory, PartInventorySchema } from './schemas/part-inventory.schema';

import { WorkOrder, WorkOrderSchema } from '../work-order/schemas/work-order.schema';
import { ProcessStage, ProcessStageSchema } from '../production/schemas/process-stage.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RawMaterial.name, schema: RawMaterialSchema },
      { name: InventoryStock.name, schema: InventoryStockSchema },
      { name: MonthlySchedule.name, schema: MonthlyScheduleSchema },
      { name: PartInventory.name, schema: PartInventorySchema },
      { name: WorkOrder.name, schema: WorkOrderSchema },
      { name: ProcessStage.name, schema: ProcessStageSchema },
    ]),
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
