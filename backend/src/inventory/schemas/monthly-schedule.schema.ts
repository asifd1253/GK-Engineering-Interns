import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class MonthlySchedule extends Document {
  @Prop({ required: true })
  serialNumber: string;

  @Prop({ required: true })
  partId: string;

  @Prop({ required: true })
  partName: string;

  @Prop({ required: true })
  requiredQuantity: number;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, required: false })
  materialId?: string;

  @Prop({ type: String, required: false })
  grade?: string;

  @Prop({ type: String, required: false })
  batchNumber?: string;

  @Prop({ type: String, required: false })
  materialReceiptId?: string;

  @Prop({ type: Number, default: 0 })
  weightPerPartKg?: number;

  @Prop({ type: Number, default: 0 })
  bufferPercent?: number;

  @Prop({ type: Number, default: 0 })
  totalWeightKg?: number; // (Qty × Weight) + (Qty × Weight × Buffer%)

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const MonthlyScheduleSchema = SchemaFactory.createForClass(MonthlySchedule);
