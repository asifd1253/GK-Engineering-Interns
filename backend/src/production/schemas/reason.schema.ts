import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Reason extends Document {
  @Prop({ required: false })
  reasonType: string; // Category: REJECTION, REWORK, SCRAP, DOWNTIME

  @Prop({ required: false })
  reason_type: string; // Alias for category

  @Prop({ required: false })
  category: string; // Primary category field

  @Prop({ required: false })
  reasonCode: string; // e.g., reason01 (optional)

  @Prop({ required: true })
  reason: string; // description

  @Prop({ required: false })
  processType: string; // DIE_CASTING, MACHINING, COATING, FINAL_QA, ALL

  @Prop({ required: false })
  type: string; // Alias for processType

  @Prop({ required: false })
  processCategory: string; // Alias for processType

  @Prop({ required: false })
  stageType: string; // Alias for processType

  @Prop({ default: false })
  requiresSubReason: boolean;

  @Prop({
    type: [
      {
        subReasonCode: String,
        subReason: String,
      },
    ],
    default: [],
  })
  subReasons: Array<{
    subReasonCode: string;
    subReason: string;
  }>;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const ReasonSchema = SchemaFactory.createForClass(Reason);
ReasonSchema.plugin(tenantPlugin);
ReasonSchema.index({ tenantId: 1, reasonCode: 1 }, { unique: true, sparse: true });
