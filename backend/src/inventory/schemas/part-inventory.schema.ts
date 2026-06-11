import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
class DetailedReason {
  @Prop({ required: true })
  reason: string;

  @Prop({ required: true, default: 0 })
  count: number;
}

@Schema({ timestamps: true })
export class PartInventory extends Document {
  @Prop({ required: true })
  partId: string;

  @Prop({ required: true })
  shift: string; // Morning, Evening, Night

  @Prop({ required: true })
  date: string; // YYYY-MM-DD

  @Prop({ required: true })
  processType: string; // DIE_CASTING, MACHINING, etc.

  @Prop({ required: true, default: 0 })
  goodCount: number;

  @Prop({ type: [Object], default: [] })
  rejectionDetails: Array<{ reason: string; count: number }>;

  @Prop({ type: [Object], default: [] })
  reworkDetails: Array<{ reason: string; count: number }>;

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const PartInventorySchema = SchemaFactory.createForClass(PartInventory);
