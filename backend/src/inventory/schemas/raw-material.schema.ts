import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PARTIAL_REJECT = 'PARTIAL_REJECT',
  RETURNED_TO_VENDOR = 'RETURNED_TO_VENDOR',
}

@Schema({ timestamps: true })
export class RawMaterial extends Document {
  @Prop({ required: true })
  materialId: string;

  @Prop({ required: true })
  grade: string;

  @Prop({ required: true })
  receivedQuantity: number;

  @Prop({ required: true })
  dateReceived: Date;

  @Prop({ required: true })
  receivedById: string; // The user ID of who received it

  @Prop({ required: false })
  approvedById?: string; // The user ID of QI who approved/rejected it

  @Prop({ required: false })
  approvedByName?: string; // The display name of the QI who approved/rejected it

  @Prop({ required: false })
  receivedByName?: string; // The display name of who received it

  @Prop({ required: false })
  batchNumber?: string;

  @Prop({ required: true })
  numberOfComponents: number;

  @Prop({ required: true })
  weightPerComponentKg: number;

  @Prop({ required: true, enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  status: ApprovalStatus;
  
  @Prop({ required: false })
  rejectionReason?: string;

  @Prop({ required: false, default: 0 })
  rejectedQuantity?: number;

  @Prop({ required: false, default: 0 })
  usedQuantity?: number;

  @Prop({
    type: [{
      workOrderId: String,
      quantity: Number,
      timestamp: { type: Date, default: Date.now }
    }],
    default: []
  })
  consumptionLog?: Array<{
    workOrderId: string;
    quantity: number;
    timestamp: Date;
  }>;

  @Prop({ type: String, required: false })
  tenantId?: string; // tenant.plugin.ts sets this
}

export const RawMaterialSchema = SchemaFactory.createForClass(RawMaterial);
