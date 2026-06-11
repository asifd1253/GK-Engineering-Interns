import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Machine extends Document {
  @Prop({ required: true, index: true })
  machineId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string; // e.g., DIE_CASTING, COATING, MACHINING

  @Prop({ required: false })
  machineType: string; // From MachineType master

  @Prop({ default: 'ACTIVE' })
  status: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  @Prop({ type: String, required: false })
  plantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const MachineSchema = SchemaFactory.createForClass(Machine);
MachineSchema.plugin(tenantPlugin);
MachineSchema.index({ tenantId: 1, machineId: 1 }, { unique: true });
