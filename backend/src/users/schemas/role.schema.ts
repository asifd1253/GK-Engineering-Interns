import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

export interface RolePermissions {
  dashboard: boolean | string[];
  inventory: boolean | string[];
  schedules: boolean | string[];
  workorders: boolean | string[];
  pipeline: boolean | string[];
  quality: boolean | string[];
  reports: boolean | string[];
  analytics: boolean | string[];
  configuration: boolean | string[];
  clients: boolean | string[];
}

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ required: true })
  name: string; // e.g. 'pdc_diecasting'

  @Prop({ required: true })
  label: string; // e.g. 'PDC - Die Casting'

  @Prop()
  description?: string;

  @Prop({ type: String, required: false })
  department?: string; // e.g. 'Production', 'Quality', 'Store', 'Management'

  @Prop({ type: Object, default: {} })
  permissions: RolePermissions;

  @Prop({ type: String, required: false })
  tenantId?: string;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.plugin(tenantPlugin);
RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });
