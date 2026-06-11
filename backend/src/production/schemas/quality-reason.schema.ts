import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class QualityReason extends Document {
  @Prop({ required: true })
  reason: string;

  @Prop({ required: true, enum: ['REJECTION', 'REWORK'] })
  category: string;

  @Prop({ required: true })
  processType: string; // e.g. DIE_CASTING, MACHINING or 'ALL'

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const QualityReasonSchema = SchemaFactory.createForClass(QualityReason);
QualityReasonSchema.plugin(tenantPlugin);
