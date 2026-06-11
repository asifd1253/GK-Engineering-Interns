import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'hourdata', timestamps: false })
export class HourData extends Document {
  @Prop() date: Date;
  @Prop() gatewayId: string;
  @Prop() shiftId: string;
  @Prop() shiftName: string;
  @Prop() hourNumber: number;
  @Prop() startTimestamp: Date;
  @Prop() endTimestamp: Date;
  @Prop() partProduced: number;
  @Prop() partRejected: number;
  @Prop() runTime: number;
  @Prop() idleTime: number;
  @Prop() breakDownTime: number;
  @Prop() availability: number;
  @Prop() performance: number;
  @Prop() quality: number;
  @Prop() oEE: number;
  @Prop() runTimePercent: number;
  @Prop() idleTimePercent: number;
  @Prop() gatewayName: string;
  @Prop() plantId: string;
  @Prop() plantName: string;
  @Prop() departmentId: string;
  @Prop() departmentName: string;
}

export const HourDataSchema = SchemaFactory.createForClass(HourData);
