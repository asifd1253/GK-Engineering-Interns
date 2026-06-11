import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class OTAConfig extends Document {
  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  fileUrl: string; // Path to the .bin file

  @Prop({ required: false, default: 0 })
  fileSize: number; // bytes

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const OTAConfigSchema = SchemaFactory.createForClass(OTAConfig);
OTAConfigSchema.plugin(tenantPlugin);
OTAConfigSchema.index({ tenantId: 1, fileName: 1, version: 1 }, { unique: true });
