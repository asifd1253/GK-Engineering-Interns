import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class MachineType extends Document {
  @Prop({ required: true })
  machineType: string; // e.g., Toshiba DC-200

  @Prop({ required: false })
  processCategory?: string; // e.g., DIE_CASTING, COATING, MACHINING

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const MachineTypeSchema = SchemaFactory.createForClass(MachineType);
MachineTypeSchema.plugin(tenantPlugin);
MachineTypeSchema.index({ tenantId: 1, machineType: 1 }, { unique: true });
