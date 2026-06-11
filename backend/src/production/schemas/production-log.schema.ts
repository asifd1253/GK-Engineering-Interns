import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProcessType {
  DIE_CASTING = 'DIE_CASTING',
  COATING = 'COATING',
  MACHINING = 'MACHINING',
  FINAL_INSPECTION = 'FINAL_INSPECTION'
}

export enum ProcessStatus {
  PENDING_PDC_APPROVAL = 'PENDING_PDC_APPROVAL',
  IN_PRODUCTION = 'IN_PRODUCTION',
  PENDING_QI_APPROVAL = 'PENDING_QI_APPROVAL',
  COMPLETED = 'COMPLETED',
}

@Schema({ timestamps: true })
export class ProductionLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'WorkOrder', required: true })
  workOrderId: Types.ObjectId;

  @Prop({ required: true, enum: ProcessType })
  processType: ProcessType;

  @Prop({ required: true, enum: ProcessStatus, default: ProcessStatus.PENDING_PDC_APPROVAL })
  status: ProcessStatus;

  @Prop({ required: false })
  pdcManagerId?: string;

  @Prop({ required: false })
  qiUserId?: string;

  @Prop({ required: false })
  inputQuantity: number;

  @Prop({ required: false })
  inputWeightKg: number;

  @Prop({ required: false })
  outputQuantity: number;

  @Prop({ required: false })
  outputWeightKg: number;

  @Prop({ required: false })
  goodPartsCount: number;

  @Prop({ required: false })
  reworkPartsCount: number;

  @Prop({ type: [String], required: false })
  reworkReasons: string[];

  @Prop({ required: false })
  rejectedPartsCount: number;

  @Prop({ type: [String], required: false })
  rejectedReasons: string[];

  @Prop({ required: false })
  scrapWeightKg: number;

  @Prop({ required: false })
  evaporatedWeightKg: number; // Specifically for Die casting

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const ProductionLogSchema = SchemaFactory.createForClass(ProductionLog);
