import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProcessType {
  DIE_CASTING = 'DIE_CASTING',
  COATING = 'COATING',
  MACHINING = 'MACHINING',
  FINAL_QA = 'FINAL_QA',
}

// Ordered sequence — used for stage reversion guard
export const PROCESS_ORDER = [ProcessType.DIE_CASTING, ProcessType.COATING, ProcessType.MACHINING, ProcessType.FINAL_QA];

export enum ProcessStageStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  READY_FOR_QI = 'READY_FOR_QI',
  QI_SUBMITTED = 'QI_SUBMITTED',
  PDC_VERIFIED = 'PDC_VERIFIED',
  COMPLETED = 'COMPLETED',
}

@Schema({ _id: false })
class StageLogEntry {
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: false }) actorName?: string;
  @Prop({ required: true }) timestamp: Date;
  @Prop({ required: false }) note?: string;
}

// Sub-document for multi-machine assignments (Die Casting & Machining)
@Schema({ _id: false })
class MachineAssignment {
  @Prop({ required: true }) machineId: string;
  @Prop({ required: true }) qty: number;
  @Prop({ required: false }) startDate: string; // Legacy field
  @Prop({ required: false }) startTime: number; // Epoch ms of startDate selected by PDC
  @Prop({ required: false }) endDate: string;   // Legacy field
  @Prop({ required: false }) endTime: number;   // Epoch ms of endDate selected by PDC
  @Prop({ required: false }) productionDate: string;
  @Prop({ required: false }) shift: string;
  @Prop({ required: false }) shiftId: string;
  @Prop({ required: false }) operatorId: string;
  @Prop({ required: false }) programId: string;
}

// Sub-document for partial QI submissions
@Schema({ _id: false })
export class QiSubmission {
  @Prop({ required: true }) timestamp: Date;
  @Prop({ required: true }) qiUserId: string;
  @Prop({ required: false }) machineId: string;
  @Prop({ required: true, default: 0 }) goodPartsCount: number;
  @Prop({ required: true, default: 0 }) reworkPartsCount: number;
  @Prop({ required: true, default: 0 }) rejectedPartsCount: number;
  @Prop({ required: false, default: 0 }) outputQuantity: number;
  @Prop({ required: false, default: 0 }) outputCount: number;
  @Prop({ required: false, default: 0 }) outputWeightKg: number;
  @Prop({ required: false, default: 0 }) scrapWeightKg: number;
  @Prop({ required: false, default: 0 }) productionValue: number;
  @Prop({ type: [Object], default: [] }) rejectionReasons: Array<{ reason: string; reasonId?: string; subReason?: string; subReasonId?: string; count: number }>;
  @Prop({ type: [Object], default: [] }) reworkReasons: Array<{ reason: string; reasonId?: string; subReason?: string; subReasonId?: string; count: number }>;
  @Prop({ type: [String], default: [] }) scrapReasons: string[];
  @Prop({ required: false }) processId: string;
  @Prop({ required: false }) shift: string;
  @Prop({ required: false }) productionDate: string;
  @Prop({ required: false, default: false }) isVerified: boolean;
  @Prop({ required: false }) verifiedBy?: string;
  @Prop({ required: false }) verifiedAt?: Date;
}

@Schema({ timestamps: true })
export class ProcessStage extends Document {
  @Prop({ type: String, ref: 'WorkOrder', required: true })
  workOrderId: any;

  @Prop({ required: false })
  workOrderNumber: string;

  @Prop({ required: false })
  workOrderType: string;

  @Prop({ required: false })
  mainWorkOrderId?: string;

  @Prop({ required: false })
  masterId: string;

  @Prop({ required: false })
  batchNumber: string;

  @Prop({ required: false })
  partId: string;

  @Prop({ required: true, type: String })
  type: string;

  @Prop({ required: true, enum: ProcessStageStatus, default: ProcessStageStatus.PENDING })
  status: ProcessStageStatus;

  @Prop({ required: false, default: 0 })
  inputQuantity: number;

  // Aggregate fields (sum of verified submissions)
  @Prop({ required: false, default: 0 })
  outputQuantity: number;

  @Prop({ required: false, default: 0 })
  outputCount: number;

  @Prop({ required: false, default: 0 })
  goodPartsCount: number;

  @Prop({ required: false, default: 0 })
  reworkPartsCount: number;

  @Prop({ required: false, default: 0 })
  rejectedPartsCount: number;

  @Prop({ required: false, default: 0 })
  scrapWeightKg: number;

  @Prop({ required: false, default: 0 })
  outputWeightKg: number;

  @Prop({ required: false, default: 0 })
  excessMaterialReceivedKg: number; // Extra material received at start of Die Cast stage

  @Prop({ required: false, default: 0 })
  routedPartsCount: number; // Tracks cumulative good parts already forwarded (multi-machine partial routing)

  // History of partial submissions
  @Prop({ type: [Object], required: false, default: [] })
  submissions: QiSubmission[];

  @Prop({ required: false, default: 0 })
  calculatedWeightPerPart: number;

  @Prop({ type: [Object], required: false, default: [] })
  rejectionReasons: Array<{ reason: string; count: number }>;

  @Prop({ type: [Object], required: false, default: [] })
  reworkReasons: Array<{ reason: string; count: number }>;

  // Reasons for scrap weight — required when scrapWeightKg > 0
  @Prop({ type: [String], required: false, default: [] })
  scrapReasons: string[];

  @Prop({ required: false })
  operatorId: string;

  @Prop({ required: false })
  shift: string;

  @Prop({ required: false })
  shiftId: string;

  @Prop({ required: false })
  productionDate: string;

  @Prop({ required: false })
  plannedTiming: string;

  // Primary machine (legacy single-machine field)
  @Prop({ required: false })
  machineId: string;

  // Multi-machine assignments — array of { machineId, qty, startDate, endDate }
  @Prop({ type: [Object], required: false, default: [] })
  machineAssignments: Array<{
    machineId: string;
    qty: number;
    startDate?: string;
    endDate?: string;
    shift?: string;
    shiftId?: string;
    operatorId?: string;
    programId?: string;
    totalCycleTimeSeconds?: number;
    partsPerCycle?: number;
    partsType?: string | number;
    selectPartType?: string | number;
    pricePerPart?: number;
    StartTime?: number;
    EndTime?: number;
    Status?: string;
    CustId?: string;
    PlantId?: string;
    custId?: string;
    plantId?: string;
    tenantId?: string;
    partCount?: number;
    palletCount?: number[];
    totalCount?: number[];
  }>;

  @Prop({ type: String, ref: 'User', required: false })
  qiUserId: any;

  @Prop({ type: String, ref: 'User', required: false })
  pdcUserId: any;

  // Rework tracking
  @Prop({ required: false, default: 0 })
  reworkCycle: number;

  @Prop({ type: String, required: false })
  parentStageId?: string;

  // Full audit log — every state transition is recorded here
  @Prop({ type: [Object], required: false, default: [] })
  stageLog: Array<{
    action: string;
    actorId: string;
    actorName?: string;
    timestamp: Date;
    note?: string;
  }>;

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const ProcessStageSchema = SchemaFactory.createForClass(ProcessStage);

// Optimized indexes for production tracking and conflict validation
ProcessStageSchema.index({ tenantId: 1, type: 1, status: 1 });
ProcessStageSchema.index({ tenantId: 1, productionDate: 1, shift: 1 });
ProcessStageSchema.index({ tenantId: 1, 'machineAssignments.machineId': 1, 'machineAssignments.productionDate': 1, 'machineAssignments.shift': 1 });
ProcessStageSchema.index({ tenantId: 1, machineId: 1, productionDate: 1, shift: 1 });
ProcessStageSchema.index({ workOrderId: 1 });
