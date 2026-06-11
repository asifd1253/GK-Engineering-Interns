import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { RolePermissions } from './role.schema';

export enum Department {
  NONE = 'NONE',
  DIE_CASTING = 'DIE_CASTING',
  COATING = 'COATING',
  MACHINING = 'MACHINING',
  STORE = 'STORE',
  MANAGEMENT = 'MANAGEMENT',
  QUALITY = 'QUALITY',
  PDC_DIE_CASTING = 'PDC_DIE_CASTING',
  PDC_COATING = 'PDC_COATING',
  PDC_MACHINING = 'PDC_MACHINING',
  PDC_QUALITY_DIE_CASTING = 'PDC_QUALITY_DIE_CASTING',
  PDC_QUALITY_COATING = 'PDC_QUALITY_COATING',
  PDC_QUALITY_MACHINING = 'PDC_QUALITY_MACHINING',
  FINAL_INSPECTION = 'FINAL_INSPECTION',
  STOCK_MANAGEMENT = 'STOCK_MANAGEMENT'
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  // Role is now a free string referencing a Role document name
  @Prop({ required: true, default: 'inventory_user' })
  role: string;

  @Prop({ enum: Department, default: Department.NONE })
  department: Department;

  // Per-user permission overrides (merged on top of role permissions at login)
  @Prop({ type: Object, default: null })
  customPermissions: RolePermissions | null;

  @Prop({ type: String, required: false })
  process?: string;

  @Prop({ type: String, required: false })
  tenantId?: string;

  @Prop({ type: String, required: false })
  plantId?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
