import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Department extends Document {
  @Prop({ required: true })
  departmentId: string; // e.g., department01

  @Prop({ required: true })
  departmentName: string; // e.g., Machine Shop

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);
DepartmentSchema.plugin(tenantPlugin);
DepartmentSchema.index({ tenantId: 1, departmentId: 1 }, { unique: true });
