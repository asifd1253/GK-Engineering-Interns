import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class DeviceGateway extends Document {
  @Prop({ required: true, unique: true })
  gatewayId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const DeviceGatewaySchema = SchemaFactory.createForClass(DeviceGateway);
DeviceGatewaySchema.plugin(tenantPlugin);
