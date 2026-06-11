import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { tenantPlugin } from '../../shared/tenant.plugin';

@Schema({ timestamps: true })
export class ProgramMaster extends Document {
  @Prop({ required: true })
  programId: string; // e.g., PRG001

  @Prop({ required: true })
  programName: string;

  @Prop({ required: true })
  programCode: string;

  @Prop({ required: true, index: true })
  processCategory: string; // e.g., DIE_CASTING, MACHINING

  @Prop()
  programType?: string;

  @Prop({ type: Number, default: 1 })
  operationSequence?: number;

  @Prop({ type: Number, default: 1 })
  totalOperations?: number;

  @Prop()
  department?: string;

  @Prop({ type: Number })
  numberOfCavities?: number;

  @Prop({ type: Number })
  weightPerPart?: number;

  @Prop({ type: Number })
  pricePerPart?: number;

  @Prop({
    type: [
      {
        processId: String,
        processName: String,
        operations: [String],
        selectType: String, // CycleTime / TargetPart
        cycleTime: {
          loadingTime: Number,
          runTime: Number,
          unloadingTime: Number,
          totalCycleTimeSeconds: Number,
        },
        targetPart: {
          targetPerHour: Number,
        },
        selectPartType: String, // PartsPerCycle / UnitPerCycle
        partsPerCycle: Number,
        scrapWeight: Number,
        scrapWeightUnit: String,
        outputPartWeight: Number,
        outputPartWeightUnit: String,
      },
    ],
    default: [],
  })
  process: any[];

  @Prop({ type: String, required: false })
  tenantId?: string;

  createdAt: string;
  updatedAt: string;
}

export const ProgramMasterSchema = SchemaFactory.createForClass(ProgramMaster);
ProgramMasterSchema.plugin(tenantPlugin);
ProgramMasterSchema.index({ tenantId: 1, programId: 1 }, { unique: true });
