import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class InventoryStock extends Document {
  @Prop({ required: true })
  grade: string;

  @Prop({ required: true, default: 0 })
  totalReceivedKg: number;

  @Prop({ required: true, default: 0 })
  totalUsedKg: number;

  @Prop({ required: true, default: 0 })
  availableStockKg: number;

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const InventoryStockSchema = SchemaFactory.createForClass(InventoryStock);
