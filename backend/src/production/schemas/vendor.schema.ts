import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Vendor extends Document {
  @Prop({ required: true })
  vendorId: string; // e.g., VEN001

  @Prop({ required: true })
  vendorName: string;

  @Prop()
  city?: string;

  @Prop()
  area?: string;

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);
VendorSchema.plugin(tenantPlugin);
VendorSchema.index({ tenantId: 1, vendorId: 1 }, { unique: true });
