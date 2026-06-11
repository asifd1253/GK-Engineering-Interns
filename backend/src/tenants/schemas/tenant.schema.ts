import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Tenant extends Document {
  @Prop({ required: true })
  domain: string;

  @Prop({ required: true, unique: true })
  tenantName: string;

  @Prop({ required: true })
  adminEmail: string;

  @Prop({ default: 'PLANT001' })
  plantId: string;

  @Prop()
  clientId: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
