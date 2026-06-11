import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Operator extends Document {
  @Prop({ required: true, index: true })
  operatorId: string; // Employee ID or similar

  @Prop({ required: true, index: true })
  name: string;

  @Prop({ required: true })
  process: string; // e.g., DIE_CASTING, COATING, MACHINING, ALL

  @Prop({ type: String, required: false })
  tenantId?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const OperatorSchema = SchemaFactory.createForClass(Operator);
OperatorSchema.plugin(tenantPlugin);
OperatorSchema.index({ tenantId: 1, operatorId: 1 }, { unique: true });
