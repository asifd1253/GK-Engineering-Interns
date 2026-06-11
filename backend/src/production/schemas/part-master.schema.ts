import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true, strict: false })
export class PartMaster extends Document {
  @Prop({ required: true })
  partId: string;

  @Prop({ required: true })
  partName: string;

  @Prop({ required: true })
  materialId: string; // Linked to materialId in MaterialMaster

  @Prop({ type: Number, required: true })
  weightPerPartKg: number;

  @Prop({ type: Number, required: false, default: 0 })
  bufferPercent: number;

  @Prop()
  tenantId: string;
}

export const PartMasterSchema = SchemaFactory.createForClass(PartMaster);
PartMasterSchema.plugin(tenantPlugin);
PartMasterSchema.index({ tenantId: 1, partId: 1 }, { unique: true });
