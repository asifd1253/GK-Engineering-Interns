import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum WorkOrderStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum WorkOrderType {
  MAIN = 'MAIN',
  SUB = 'SUB',
  REWORK = 'REWORK'
}

@Schema({ _id: false })
export class MachineAssignment {
  @Prop({ required: false })
  machineId: string;

  @Prop({ required: false })
  operatorId: string;

  @Prop({ required: true })
  targetQuantity: number;

  @Prop({ required: false })
  programNumber: string;
}

@Schema({ timestamps: true })
export class WorkOrder extends Document {
  @Prop({ required: false })
  masterId: string;

  @Prop({ required: false })
  workOrderId: string;

  @Prop({ required: true, enum: WorkOrderType, default: WorkOrderType.MAIN })
  type: WorkOrderType;

  @Prop({ type: Types.ObjectId, ref: 'WorkOrder', required: false })
  parentWorkOrderId?: Types.ObjectId;

  @Prop({ required: false })
  mainWorkOrderId?: string;

  @Prop({ required: false })
  processType: string; // e.g., DIE_CASTING, COATING

  @Prop({ required: true })
  partId: string;

  @Prop({ required: true })
  targetPartCount: number;

  @Prop({ required: false })
  materialGrade: string;

  @Prop({ required: false })
  batchNumber: string;

  @Prop({ required: false })
  requiredQuantityKg: number;

  @Prop({ required: false, default: 0 })
  bufferKg: number;

  @Prop({ required: false, default: false })
  isBufferApplied: boolean;

  @Prop({ type: [String], required: false })
  shifts: string[];

  // Machine assignment - supporting multi-machine with operators
  @Prop({ type: [SchemaFactory.createForClass(MachineAssignment)], default: [] })
  machineAssignments: MachineAssignment[];

  @Prop({ required: false })
  machineId: string; // Legacy field for single machine

  @Prop({ required: false })
  operatorId: string; // Legacy field for single operator

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: false })
  endDate: Date;

  @Prop({ required: true, enum: WorkOrderStatus, default: WorkOrderStatus.PENDING_APPROVAL })
  status: WorkOrderStatus;

  @Prop({ type: String, ref: 'User', required: false })
  pdcManagerId: any;

  @Prop({ required: false, default: 0 })
  pricePerPart: number;

  @Prop({ required: false, default: 0 })
  weightPerPart: number;

  @Prop({ required: false, default: false })
  isExternalVendor: boolean;

  @Prop({ required: false })
  vendorName: string;

  @Prop({ type: [String], required: false })
  acceptancePoints: string[];

  @Prop({ required: false })
  date: string;

  @Prop({ required: false, default: 0 })
  partsPerCycle: number;

  @Prop({ required: false, default: 0 })
  actualTarget: number;

  @Prop({ required: false })
  initialStage: string;

  @Prop({ type: Types.ObjectId, ref: 'MonthlySchedule', required: false })
  scheduleId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  tenantId?: string;

  @Prop({ type: String, required: false })
  plantId?: string;

  @Prop({ required: false, default: false })
  isMaterialDeducted: boolean;

  @Prop({ required: false, default: 0 })
  actualMaterialReceivedKg: number;
}


export const WorkOrderSchema = SchemaFactory.createForClass(WorkOrder);
