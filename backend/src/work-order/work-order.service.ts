import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkOrder, WorkOrderStatus } from './schemas/work-order.schema';
import { InventoryStock } from '../inventory/schemas/inventory-stock.schema';
import { ProcessStage, ProcessType, ProcessStageStatus } from '../production/schemas/process-stage.schema';
import { RawMaterial } from '../inventory/schemas/raw-material.schema';
import { Process } from '../production/schemas/process.schema';
import { AcceptancePoint } from './schemas/acceptance-point.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class WorkOrderService {
  constructor(
    @InjectModel(WorkOrder.name) private workOrderModel: Model<WorkOrder>,
    @InjectModel(InventoryStock.name) private stockModel: Model<InventoryStock>,
    @InjectModel(ProcessStage.name) private stageModel: Model<ProcessStage>,
    @InjectModel(RawMaterial.name) private rawMaterialModel: Model<RawMaterial>,
    @InjectModel(AcceptancePoint.name) private pointModel: Model<AcceptancePoint>,
    @InjectModel(Process.name) private processModel: Model<Process>,
    private inventoryService: InventoryService,
  ) {}

  async create(createData: any): Promise<WorkOrder> {
    const isSub = createData.type === 'SUB' || createData.type === 'REWORK';
    
    if (isSub && !createData.parentWorkOrderId) {
      throw new BadRequestException('Sub-Work Order must have a parentWorkOrderId');
    }

    const targetParts = Number(createData.targetPartCount || 0);
    const wpp = Number(createData.weightPerPart || 0);
    const calculatedKg = targetParts * wpp;
    
    const requiredKg = Number(createData.requiredQuantityKg || calculatedKg || 0);
    const bufferKg = Number(createData.bufferKg || 0);
    const totalKgToReserve = requiredKg + bufferKg;
    const grade = createData.materialGrade;

    // 1. Validate against Parent if SUB
    if (isSub) {
      const parent = await this.workOrderModel.findById(createData.parentWorkOrderId).exec();
      if (!parent) throw new NotFoundException('Parent Work Order not found');

      // Validate Target Quantity
      const siblings = await this.workOrderModel.find({ 
        parentWorkOrderId: createData.parentWorkOrderId,
        processType: createData.processType,
        _id: { $ne: createData._id }
      }).exec();
      
      const totalSiblingTarget = siblings.reduce((sum, s) => sum + (s.targetPartCount || 0), 0);
      if (totalSiblingTarget + (createData.targetPartCount || 0) > parent.targetPartCount) {
        throw new BadRequestException(`Target quantity exceeds remaining parent target. Max allowed: ${parent.targetPartCount - totalSiblingTarget}`);
      }

      // Validate Dates
      const start = new Date(createData.startDate);
      const end = createData.endDate ? new Date(createData.endDate) : start;
      if (start < parent.startDate || (parent.endDate && end > parent.endDate)) {
        throw new BadRequestException(`Sub-Work Order dates must be within parent range: ${parent.startDate.toISOString().split('T')[0]} to ${parent.endDate?.toISOString().split('T')[0]}`);
      }

      // Inherit details if not provided
      createData.partId = parent.partId;
      if (!createData.mainWorkOrderId) createData.mainWorkOrderId = parent.workOrderId;
      if (!createData.materialGrade) createData.materialGrade = parent.materialGrade;
      if (!createData.masterId) createData.masterId = parent.masterId;
    }

    // 2. Validate Overall Available Stock (Macro)
    if (grade && totalKgToReserve > 0) {
      const stock = await this.stockModel.findOne({ grade }).exec();
      if (stock && stock.availableStockKg < totalKgToReserve) {
        throw new BadRequestException(
          `Insufficient stock for grade ${grade}. Available: ${stock.availableStockKg}kg, Required (incl. buffer): ${totalKgToReserve}kg`
        );
      }
    }

    // Ensure workOrderId is present
    if (!createData.workOrderId) {
      const prefix = isSub ? 'SWO' : 'WO';
      const last = await this.workOrderModel
        .findOne({ type: createData.type })
        .sort({ workOrderId: -1 })
        .select('workOrderId')
        .lean();
      const lastNum = last?.workOrderId
        ? parseInt(last.workOrderId.replace(/\D/g, ''), 10) || 0
        : 0;
      createData.workOrderId = `${prefix}-${(lastNum + 1).toString().padStart(3, '0')}`;
    }

    const newWo = new this.workOrderModel({
      ...createData,
      requiredQuantityKg: requiredKg,
      status: createData.status || WorkOrderStatus.NOT_STARTED
    });
    const savedWo = await newWo.save();

    // 3. Create process stage(s)
    if (savedWo.type === 'MAIN') {
      // Main WO creates the first stage (e.g. Die Casting)
      let initialStageType = createData.initialStage;
      if (!initialStageType) {
        const firstProcess = await this.processModel
          .findOne({ tenantId: savedWo.tenantId })
          .sort({ order: 1, createdAt: 1 })
          .exec();
        initialStageType = firstProcess ? firstProcess.processId : ProcessType.DIE_CASTING;
      }

      const initialStage = new this.stageModel({
        workOrderId: savedWo._id,
        workOrderNumber: savedWo.workOrderId,
        workOrderType: savedWo.type,
        mainWorkOrderId: savedWo.mainWorkOrderId || savedWo.workOrderId,
        masterId: savedWo.masterId,
        partId: savedWo.partId,
        type: initialStageType as ProcessType,
        status: ProcessStageStatus.PENDING,
        inputQuantity: savedWo.targetPartCount || 0,
        tenantId: savedWo.tenantId,
        operatorId: savedWo.operatorId,
        machineAssignments: (savedWo.machineAssignments || []).map(a => ({
          machineId: a.machineId,
          qty: a.targetQuantity,
          startDate: savedWo.startDate ? new Date(savedWo.startDate).toISOString() : undefined
        }))
      });
      await initialStage.save();
    } else {
      // Sub Work Order creates its own specific process stage
      const subStage = new this.stageModel({
        workOrderId: savedWo._id,
        workOrderNumber: savedWo.workOrderId,
        workOrderType: savedWo.type,
        mainWorkOrderId: savedWo.mainWorkOrderId,
        masterId: savedWo.masterId,
        partId: savedWo.partId,
        type: savedWo.processType as ProcessType,
        status: ProcessStageStatus.PENDING, // Changed to PENDING to allow operator to start explicitly
        inputQuantity: savedWo.targetPartCount || 0,
        tenantId: savedWo.tenantId,
        operatorId: savedWo.operatorId,
        machineAssignments: (savedWo.machineAssignments || []).map(a => ({
          machineId: a.machineId,
          qty: a.targetQuantity,
          startDate: savedWo.startDate ? new Date(savedWo.startDate).toISOString() : undefined
        }))
      });
      await subStage.save();
    }

    return savedWo;
  }

  async findAll(): Promise<WorkOrder[]> {
    return this.workOrderModel.find().sort({ createdAt: -1 }).populate('pdcManagerId').exec();
  }

  async findOne(id: string): Promise<WorkOrder | null> {
    return this.workOrderModel.findById(id).populate('pdcManagerId').exec();
  }

  async update(id: string, updateData: any): Promise<WorkOrder | null> {
    const wo = await this.workOrderModel.findById(id).exec();
    if (!wo) return null;

    // Trigger deduction when changing to IN_PROGRESS
    if (updateData.status === WorkOrderStatus.IN_PROGRESS && wo.status !== WorkOrderStatus.IN_PROGRESS) {
      await this.inventoryService.deductMaterialForWorkOrder(id);
    }

    return this.workOrderModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  private async deductStock(grade?: string, requiredKg: number = 0, masterId?: string) {
    if (!grade || requiredKg <= 0) return;
    
    const stock = await this.stockModel.findOne({ grade }).exec();
    if (stock && stock.availableStockKg < requiredKg) {
        throw new BadRequestException(`Insufficient stock for grade ${grade}. Available: ${stock.availableStockKg}kg`);
    }

    if (masterId) {
      const batches = await this.rawMaterialModel.find({ 
        materialId: masterId, 
        status: 'APPROVED' 
      }).sort({ createdAt: 1 }).exec();

      let remainingToDeduct = requiredKg;
      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const availableInBatch = (batch.receivedQuantity - (batch.rejectedQuantity || 0) - (batch.usedQuantity || 0));
        if (availableInBatch > 0) {
          const deduction = Math.min(availableInBatch, remainingToDeduct);
          batch.usedQuantity = (batch.usedQuantity || 0) + deduction;
          await batch.save();
          remainingToDeduct -= deduction;
          console.log(`[WorkOrderService] Deducted ${deduction}kg from Batch ${batch.batchNumber}. Remaining: ${remainingToDeduct}kg`);
        }
      }
    }

    if (stock) {
      stock.totalUsedKg += requiredKg;
      stock.availableStockKg -= requiredKg;
      await stock.save();
    }
  }

  async remove(id: string): Promise<void> {
    const wo = await this.workOrderModel.findById(id).exec();
    if (!wo) throw new NotFoundException('Work Order not found');

    // Check if production has actually started
    const woStages = await this.stageModel.find({ workOrderId: id }).exec();
    const hasStarted = woStages.some(s => 
      s.status !== ProcessStageStatus.PENDING || 
      (s.goodPartsCount || 0) > 0 || 
      (s.rejectedPartsCount || 0) > 0 || 
      (s.reworkPartsCount || 0) > 0 ||
      s.submissions?.some(sub => sub.isVerified)
    );

    if (hasStarted || wo.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot delete a work order after production or verification has started.');
    }

    // ONLY restore inventory if the work order had actually reserved it (crossed from NOT_STARTED to IN_PROGRESS)
    // But wait, if it's IN_PROGRESS but hasStarted is false, we should restore.
    if (wo.status !== WorkOrderStatus.NOT_STARTED && wo.status !== WorkOrderStatus.PENDING_APPROVAL) {
      const grade = wo.materialGrade;
      const totalKg = (wo.requiredQuantityKg || 0) + (wo.bufferKg || 0);
      if (grade && totalKg > 0) {
        const stock = await this.stockModel.findOne({ grade }).exec();
        if (stock) {
          console.log(`[WorkOrderService] Restoring ${totalKg}kg for grade ${grade}`);
          stock.totalUsedKg = Math.max(0, stock.totalUsedKg - totalKg);
          stock.availableStockKg += totalKg;
          await stock.save();
        }
      }
    }

    const result = await this.workOrderModel.findByIdAndDelete(id).exec();
    
    // Find all sub-work orders (SWO/REWORK) linked to this parent
    const subOrders = await this.workOrderModel.find({ parentWorkOrderId: id }).exec();
    const subOrderIds = subOrders.map(s => s._id);

    // Cascade delete any process stages linked to this Work Order OR its sub-orders
    const stagesDeleted = await this.stageModel.deleteMany({ 
      $or: [
        { workOrderId: id },
        { workOrderId: { $in: subOrderIds } }
      ]
    }).exec();

    // Delete the sub-work orders themselves
    const subsDeleted = await this.workOrderModel.deleteMany({ parentWorkOrderId: id }).exec();

    console.log(`[WorkOrderService] Deleted Work Order ${id}: ${!!result}. Deleted ${subsDeleted.deletedCount} sub-orders and ${stagesDeleted.deletedCount} linked process stages.`);
  }

  async checkMachineOccupancy(machineId: string): Promise<{ isOccupied: boolean, details?: any }> {
    const activeStage = await this.stageModel.findOne({
      $and: [
        {
          $or: [
            { machineId: machineId },
            { 'machineAssignments.machineId': machineId }
          ]
        },
        {
          status: { $in: [ProcessStageStatus.PENDING, ProcessStageStatus.IN_PROGRESS, ProcessStageStatus.QI_SUBMITTED] }
        }
      ]
    }).populate('workOrderId').exec();
    
    if (activeStage) {
      const wo = activeStage.workOrderId as any;
      return { 
        isOccupied: true,
        details: {
          partId: wo?.partId,
          stageType: activeStage.type,
          status: activeStage.status
        }
      };
    }

    return { isOccupied: false };
  }

  async checkPartStatus(partId: string): Promise<{ status: 'AVAILABLE' | 'WIP' | 'COMPLETED', workOrderId?: string }> {
    const workOrder = await this.workOrderModel.findOne({ partId }).sort({ createdAt: -1 }).exec();
    if (!workOrder) return { status: 'AVAILABLE' };
    
    if (workOrder.status === WorkOrderStatus.COMPLETED) {
      return { status: 'COMPLETED', workOrderId: workOrder._id.toString() };
    }
    
    return { status: 'WIP', workOrderId: workOrder._id.toString() };
  }

  async getCompletedParts(): Promise<string[]> {
    const completedOrders = await this.workOrderModel.find({ status: WorkOrderStatus.COMPLETED }).select('partId').exec();
    return Array.from(new Set(completedOrders.map((wo: any) => wo.partId)));
  }

  async getAcceptancePoints(): Promise<AcceptancePoint[]> {
    return this.pointModel.find().exec();
  }

  async createAcceptancePoint(data: any): Promise<AcceptancePoint> {
    return new this.pointModel(data).save();
  }

  async removeAcceptancePoint(id: string): Promise<boolean> {
    const result = await this.pointModel.findByIdAndDelete(id).exec();
    return !!result;
  }
}
