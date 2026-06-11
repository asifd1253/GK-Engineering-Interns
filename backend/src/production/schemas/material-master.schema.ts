import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class MaterialMaster extends Document {
  @Prop({ required: true })
  materialId: string;

  @Prop({ required: true })
  materialName: string;

  @Prop({ type: [String], default: ['A', 'B', 'C', 'D', 'E', 'F'] })
  materialGrades: string[];

  @Prop({ type: String, default: 'KG' })
  uom: string; // Unit of Measurement: KG, Ton, Litre, Pcs

  @Prop()
  tenantId: string;
}

export const MaterialMasterSchema = SchemaFactory.createForClass(MaterialMaster);
MaterialMasterSchema.plugin(tenantPlugin);
MaterialMasterSchema.index({ tenantId: 1, materialId: 1 }, { unique: true });
