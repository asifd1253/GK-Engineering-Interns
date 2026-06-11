import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class AcceptancePoint extends Document {
  @Prop({ required: true })
  point: string;

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const AcceptancePointSchema = SchemaFactory.createForClass(AcceptancePoint);
AcceptancePointSchema.plugin(tenantPlugin);
AcceptancePointSchema.index({ tenantId: 1, point: 1 }, { unique: true });
