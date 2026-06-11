import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Process extends Document {
  @Prop({ required: true })
  processId: string; // auto-generated (e.g. process01) if not provided

  @Prop({ required: true })
  processName: string; // e.g., Die Casting

  @Prop({ required: false })
  operation?: string; // e.g., "Die Casting Process"

  @Prop({ required: false })
  description?: string;

  @Prop({ required: false, default: false })
  isMultiMachine: boolean; // true → supports multi-machine split

  @Prop({ required: false, default: 0 })
  order: number;

  @Prop({ required: false })
  custId?: string; // auto-bound from tenant on create

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const ProcessSchema = SchemaFactory.createForClass(Process);
ProcessSchema.plugin(tenantPlugin);
ProcessSchema.index({ tenantId: 1, processId: 1 }, { unique: true });
