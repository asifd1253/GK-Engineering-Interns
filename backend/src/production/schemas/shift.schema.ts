import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Shift extends Document {
  @Prop({ required: true })
  shiftId: string; // e.g., SH001

  @Prop({ required: true })
  name: string; // e.g., Shift-A

  @Prop({ required: true })
  startTime: string; // e.g., 08:00

  @Prop({ required: true })
  endTime: string; // e.g., 20:00

  @Prop({ default: false })
  startNextDay: boolean;

  @Prop({ default: false })
  endNextDay: boolean;

  @Prop({
    type: [
      {
        breakName: String,
        breakDuration: String,
        breakStartTime: String,
        breakEndTime: String,
      },
    ],
    default: [],
  })
  breaks: Array<{
    breakName: string;
    breakDuration: string;
    breakStartTime: string;
    breakEndTime: string;
  }>;

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const ShiftSchema = SchemaFactory.createForClass(Shift);
ShiftSchema.plugin(tenantPlugin);
ShiftSchema.index({ tenantId: 1, shiftId: 1 }, { unique: true });
