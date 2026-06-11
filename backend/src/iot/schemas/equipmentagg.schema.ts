import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'equipmentagg', timestamps: false })
export class EquipmentAgg extends Document {
  @Prop() fromTo: string;
  @Prop() name: string;          // e.g. "Idle", "Running", "BreakDown"
  @Prop({ type: [Object] }) value: any[];
  @Prop() packet_id: number;
  @Prop() eqSts: number;
  @Prop() qlt: number;
  @Prop() partCnt: number;
  @Prop({ type: Object }) itemStyle: any;
  @Prop({ type: Object }) reasonData: any;
  @Prop() isPlannedDowntime: string;
  @Prop() gatewayID: string;
  @Prop() customerID: string;
  @Prop() createdAt: Date;
}

export const EquipmentAggSchema = SchemaFactory.createForClass(EquipmentAgg);
