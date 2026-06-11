import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class Device extends Document {
  @Prop({ required: true })
  custId: string;

  @Prop({ required: true })
  plantId: string;

  @Prop({ required: true, unique: true })
  gatewayId: string; // Exactly 12 characters, alphanumeric

  @Prop({ required: true, unique: true })
  deviceId: string;

  @Prop({ required: true })
  deviceName: string;

  @Prop({ required: true })
  gatewayName: string;

  @Prop()
  licensing?: string; // 3 months, 1 months, 6 months, 1 year

  @Prop()
  machineType?: string;
  @Prop()
  gatewayType?: string;
  @Prop()
  partCountType?: string;
  @Prop({
    type: {
      enabled: { type: Number, default: 0 },
      postTime: { type: Number, default: 10 },
      algorithm: { type: Number, default: 1 },
      dutyCyc: { type: Number, default: 60 },
      runDur: { type: Number, default: 60 },
      interlock: { type: Number, default: 1 },
      dep: { type: [Number], default: [] },
    },
    default: { enabled: 0, postTime: 10, algorithm: 1, dutyCyc: 60, runDur: 60, interlock: 1, dep: [] },
  })
  avbFactor: any;

  @Prop({
    type: {
      enabled: { type: Number, default: 0 },
      postTime: { type: Number, default: 30 },
      algorithm: { type: [Number], default: [] },
      debounceTime: { type: Number, default: 0 },
      dep: { type: [Number], default: [] },
    },
    default: { enabled: 0, postTime: 30, algorithm: [], debounceTime: 0, dep: [] },
  })
  performanceFactor: any;

  @Prop({
    type: {
      enabled: { type: Number, default: 1 },
      scanTime: { type: Number, default: 10 },
      postTime: { type: Number, default: 10 },
    },
    default: { enabled: 1, scanTime: 10, postTime: 10 },
  })
  INPin: any;

  @Prop({
    type: {
      enabled: { type: Number, default: 1 },
      postTime: { type: Number, default: 10 },
      freq: { type: Number, default: 0 },
      phaseSeq: { type: Number, default: 1 },
      cngfFactor: { type: [Number], default: [] },
    },
    default: { enabled: 1, postTime: 10, freq: 0, phaseSeq: 1, cngfFactor: [] },
  })
  eMICConfig: any;

  @Prop({ type: String, required: false })
  tenantId?: string;

  @Prop()
  parentKey?: string;

  createdAt: string;
  updatedAt: string;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
DeviceSchema.plugin(tenantPlugin);
