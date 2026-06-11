import { Injectable, NotFoundException, BadRequestException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { tenantContext } from '../shared/tenant.context';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ProcessStage, ProcessStageStatus, ProcessType, PROCESS_ORDER } from './schemas/process-stage.schema';
import { Machine } from './schemas/machine.schema';
import { Shift } from './schemas/shift.schema';
import { QualityReason } from './schemas/quality-reason.schema';
import { WorkOrder, WorkOrderStatus, WorkOrderType } from '../work-order/schemas/work-order.schema';
import { InventoryStock } from '../inventory/schemas/inventory-stock.schema';
import { RawMaterial } from '../inventory/schemas/raw-material.schema';
import { Department } from './schemas/department.schema';
import { MachineType } from './schemas/machine-type.schema';
import { Reason } from './schemas/reason.schema';
import { Process } from './schemas/process.schema';
import { ProgramMaster } from './schemas/program-master.schema';
import { Vendor } from './schemas/vendor.schema';
import { Operator } from './schemas/operator.schema';
import { MaterialMaster } from './schemas/material-master.schema';
import { PartMaster } from './schemas/part-master.schema';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../shared/notification.service';
import { Device } from '../iot/schemas/device.schema';

@Injectable()
export class ProductionService implements OnModuleInit, OnModuleDestroy {
  private autoSignalQiTimer?: NodeJS.Timeout;
  private autoSignalQiRunning = false;

  constructor(
    @InjectModel(ProcessStage.name) private stageModel: Model<ProcessStage>,
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
    @InjectModel(WorkOrder.name) private workOrderModel: Model<WorkOrder>,
    @InjectModel(InventoryStock.name) private stockModel: Model<InventoryStock>,
    @InjectModel(RawMaterial.name) private rawMaterialModel: Model<RawMaterial>,
    @InjectModel(QualityReason.name) private reasonModel: Model<QualityReason>,
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    @InjectModel(Department.name) private departmentModel: Model<Department>,
    @InjectModel(MachineType.name) private machineTypeModel: Model<MachineType>,
    @InjectModel(Reason.name) private reasonMasterModel: Model<Reason>,
    @InjectModel(Process.name) private processModel: Model<Process>,
    @InjectModel(ProgramMaster.name) private programMasterModel: Model<ProgramMaster>,
    @InjectModel(Vendor.name) private vendorModel: Model<Vendor>,
    @InjectModel(Operator.name) private operatorModel: Model<Operator>,
    @InjectModel(MaterialMaster.name) private materialModel: Model<MaterialMaster>,
    @InjectModel(PartMaster.name) private partModel: Model<PartMaster>,
    @InjectModel(Device.name) private deviceModel: Model<Device>,
    @InjectConnection() private appConnection: Connection,
    private inventoryService: InventoryService,
    private notificationService: NotificationService,
  ) { }

  onModuleInit() {
    this.autoSignalQiTimer = setInterval(() => {
      this.autoSignalQiForDueStages().catch((error) => {
        console.error('[ProductionService] Auto signal QI failed:', error);
      });
    }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.autoSignalQiTimer) clearInterval(this.autoSignalQiTimer);
  }

  private appendLog(stage: ProcessStage, action: string, actorId: string, actorName?: string, note?: string) {
    if (!stage.stageLog) stage.stageLog = [];
    stage.stageLog.push({ action, actorId, actorName, timestamp: new Date(), note });
  }

  private toNumber(value: any, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toNumberArray(value: any): number[] {
    if (!Array.isArray(value)) return [];
    return value.map((item: any) => this.toNumber(item));
  }

  private sumNumberArrays(total: number[], values: number[]) {
    const length = Math.max(total.length, values.length);
    const output = Array.from({ length }, (_item, index) => total[index] || 0);
    values.forEach((value, index) => {
      output[index] = (output[index] || 0) + value;
    });
    return output;
  }

  private diffNumberArrays(last: number[], first: number[]) {
    const length = Math.max(last.length, first.length);
    return Array.from({ length }, (_item, index) => (last[index] || 0) - (first[index] || 0));
  }

  private getFirstArray(record: any, keys: string[]) {
    for (const key of keys) {
      const value = record?.[key];
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  private getFirstValue(record: any, keys: string[]) {
    for (const key of keys) {
      const value = record?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  private firstNonEmpty(...values: any[]) {
    return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  }

  private toDateOnly(value: any): string {
    if (!value) return new Date().toISOString().split('T')[0];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (typeof value === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
      const [day, month, year] = value.split('-');
      return `${year}-${month}-${day}`;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
    return String(value).slice(0, 10);
  }

  private getShiftKeyCandidates(value: any): string[] {
    return [value?._id, value?.id, value?.shiftId, value?.name, value]
      .filter((item) => item !== undefined && item !== null && item !== '')
      .map((item) => String(item));
  }

  private getTenantShiftMapKey(tenantId: any, shiftKey: any): string | null {
    const tenant = this.firstNonEmpty(tenantId);
    const key = this.firstNonEmpty(shiftKey);
    return tenant && key ? `${String(tenant)}::${String(key)}` : null;
  }

  private addShiftToMap(shiftMap: Map<string, any>, shiftItem: any) {
    const tenantId = this.firstNonEmpty(shiftItem?.tenantId, shiftItem?.custId);
    this.getShiftKeyCandidates(shiftItem).forEach((key) => {
      const tenantKey = this.getTenantShiftMapKey(tenantId, key);
      if (tenantKey && !shiftMap.has(tenantKey)) shiftMap.set(tenantKey, shiftItem);
      if (!shiftMap.has(key)) shiftMap.set(key, shiftItem);
    });
  }

  private findShiftInMap(shiftMap: Map<string, any>, tenantId: any, keys: any[]) {
    for (const key of keys) {
      if (key === undefined || key === null || key === '') continue;
      const tenantKey = this.getTenantShiftMapKey(tenantId, key);
      if (tenantKey && shiftMap.has(tenantKey)) return shiftMap.get(tenantKey);
    }
    for (const key of keys) {
      if (key === undefined || key === null || key === '') continue;
      const plainKey = String(key);
      if (shiftMap.has(plainKey)) return shiftMap.get(plainKey);
    }
    return null;
  }

  private getShiftEndTime(productionDate: string, shiftDoc?: any): number | undefined {
    if (!shiftDoc?.endTime) return undefined;
    return this.getEpochForClock(productionDate, shiftDoc.endTime, Boolean(shiftDoc.endNextDay));
  }

  private getShiftStartTime(productionDate: string, shiftDoc?: any): number | undefined {
    if (!shiftDoc?.startTime) return undefined;
    return this.getEpochForClock(productionDate, shiftDoc.startTime, Boolean(shiftDoc.startNextDay));
  }

  private getEpochForClock(productionDate: string, clock: string, addDay = false): number | undefined {
    if (!clock) return undefined;
    const normalizedClock = String(clock).trim();
    const match = normalizedClock.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return undefined;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
    const end = new Date(`${this.toDateOnly(productionDate)}T00:00:00`);
    end.setHours(hours, minutes, 0, 0);
    if (addDay) end.setDate(end.getDate() + 1);
    const timestamp = end.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private getPlannedEndTime(productionDate: string, plannedTiming?: string): number | undefined {
    const endClock = String(plannedTiming || '').split('-').pop()?.trim();
    return endClock ? this.getEpochForClock(productionDate, endClock) : undefined;
  }

  private getPlannedStartTime(productionDate: string, plannedTiming?: string): number | undefined {
    const startClock = String(plannedTiming || '').split('-')[0]?.trim();
    return startClock ? this.getEpochForClock(productionDate, startClock) : undefined;
  }

  private getAssignmentStartTime(productionDate: string, shiftDoc?: any, plannedTiming?: string): number | undefined {
    return this.getShiftStartTime(productionDate, shiftDoc) ?? this.getPlannedStartTime(productionDate, plannedTiming);
  }

  private getAssignmentEndTime(productionDate: string, shiftDoc?: any, plannedTiming?: string): number | undefined {
    return this.getShiftEndTime(productionDate, shiftDoc) ?? this.getPlannedEndTime(productionDate, plannedTiming);
  }

  private getLegacyShiftEndTime(productionDate: string, shiftDoc?: any): number | undefined {
    if (!shiftDoc?.endTime) return undefined;
    const [hours, minutes] = String(shiftDoc.endTime).split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
    const end = new Date(`${this.toDateOnly(productionDate)}T00:00:00`);
    end.setHours(hours, minutes, 0, 0);
    if (shiftDoc.endNextDay) end.setDate(end.getDate() + 1);
    const timestamp = end.getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private normalizeMachineAssignment(
    ma: any,
    extraDetails: any,
    productionDate: string,
    shift: string | undefined,
    fallbackStartTime: number,
    shiftDoc?: any,
    machineDoc?: any,
  ) {
    const partsType = ma.partsType ?? ma.selectPartType ?? extraDetails?.partsType ?? extraDetails?.selectPartType;
    const assignmentDate = ma.productionDate || ma.startDate || productionDate;
    const shiftStartTime = this.getAssignmentStartTime(assignmentDate, shiftDoc, extraDetails?.plannedTiming);
    const shiftEndTime = this.getAssignmentEndTime(assignmentDate, shiftDoc, extraDetails?.plannedTiming);
    const providedStartTime = Number(ma.StartTime ?? ma.startTime);
    const providedEndTime = Number(ma.EndTime ?? ma.endTime);
    const plantId = this.firstNonEmpty(machineDoc?.plantId, machineDoc?.PlantId, ma.plantId, ma.PlantId);
    const tenantId = this.firstNonEmpty(extraDetails?.tenantId, ma.tenantId);
    const {
      cycleTime: _cycleTime,
      startTime: _startTime,
      StartTime: _StartTime,
      endTime: _endTime,
      EndTime: _EndTime,
      plantId: _plantId,
      PlantId: _PlantId,
      tenantId: _tenantId,
      status: _status,
      ...assignment
    } = ma;

    return {
      ...assignment,
      programId: ma.programId ?? extraDetails?.programId ?? '',
      totalCycleTimeSeconds: this.toNumber(ma.totalCycleTimeSeconds ?? ma.cycleTime ?? extraDetails?.totalCycleTimeSeconds ?? extraDetails?.cycleTime),
      partsPerCycle: this.toNumber(ma.partsPerCycle ?? extraDetails?.partsPerCycle),
      partsType: partsType ?? '',
      Status: ma.Status ?? ma.status ?? ProcessStageStatus.IN_PROGRESS,
      productionDate: assignmentDate,
      shift: ma.shift || shiftDoc?.shiftId || shiftDoc?.name || shift,
      StartTime: Number.isFinite(providedStartTime) ? providedStartTime : shiftStartTime ?? fallbackStartTime,
      ...(Number.isFinite(providedEndTime) ? { EndTime: providedEndTime } : shiftEndTime !== undefined ? { EndTime: shiftEndTime } : {}),
      ...(plantId ? { plantId, PlantId: plantId } : {}),
      ...(tenantId ? { tenantId } : {}),
      actualMaterialReceivedKg: ma.actualMaterialReceivedKg ?? 0,
    };
  }

  private async enrichStageAssignmentsForResponse(stages: ProcessStage[]): Promise<any[]> {
    const machineIds = new Set<string>();
    const shiftKeys = new Set<string>();
    const tenantIds = new Set<string>();
    stages.forEach((stage: any) => {
      this.getShiftKeyCandidates(this.firstNonEmpty(stage.tenantId, stage.custId)).forEach((key) => tenantIds.add(key));
      this.getShiftKeyCandidates(stage.shiftId).forEach((key) => shiftKeys.add(key));
      this.getShiftKeyCandidates(stage.shift).forEach((key) => shiftKeys.add(key));
      (stage.machineAssignments || []).forEach((ma: any) => {
        if (ma.machineId) machineIds.add(String(ma.machineId));
        this.getShiftKeyCandidates(this.firstNonEmpty(ma.tenantId, ma.custId, stage.tenantId, stage.custId)).forEach((key) => tenantIds.add(key));
        this.getShiftKeyCandidates(ma.shiftId).forEach((key) => shiftKeys.add(key));
        this.getShiftKeyCandidates(ma.shift).forEach((key) => shiftKeys.add(key));
      });
    });

    const shiftKeyList = [...shiftKeys];
    const tenantIdList = [...tenantIds];
    const [machines, devices, shifts] = await Promise.all([
      machineIds.size ? this.machineModel.find({ machineId: { $in: [...machineIds] } }).setOptions({ bypassTenant: true }).exec() : Promise.resolve([]),
      machineIds.size
        ? this.deviceModel.find({
          $or: [
            { gatewayId: { $in: [...machineIds] } },
            { deviceId: { $in: [...machineIds] } },
          ],
        }).setOptions({ bypassTenant: true }).exec()
        : Promise.resolve([]),
      shiftKeyList.length
        ? this.shiftModel.find({
          $and: [
            {
              $or: [
                { shiftId: { $in: shiftKeyList } },
                { name: { $in: shiftKeyList } },
                { _id: { $in: shiftKeyList.filter((key) => /^[a-f\d]{24}$/i.test(key)) } },
              ],
            },
            tenantIdList.length
              ? { $or: [{ tenantId: { $in: tenantIdList } }, { custId: { $in: tenantIdList } }] }
              : {},
          ],
        }).setOptions({ bypassTenant: true }).exec()
        : Promise.resolve([]),
    ]);
    const machineMap = new Map(machines.map((machine: any) => [String(machine.machineId), machine]));
    const deviceMap = new Map<string, any>();
    devices.forEach((device: any) => {
      this.firstNonEmpty(device.gatewayId, device.deviceId) && deviceMap.set(String(this.firstNonEmpty(device.gatewayId, device.deviceId)), device);
    });
    const shiftMap = new Map<string, any>();
    shifts.forEach((shiftItem: any) => {
      this.addShiftToMap(shiftMap, shiftItem);
    });

    return stages.map((stage: any) => {
      const plainStage = typeof stage.toObject === 'function' ? stage.toObject() : stage;
      const stageTenantId = this.firstNonEmpty(plainStage.tenantId, plainStage.custId);
      const stageShift = this.findShiftInMap(shiftMap, stageTenantId, [plainStage.shiftId, plainStage.shift]);
      return {
        ...plainStage,
        machineAssignments: (plainStage.machineAssignments || []).map((ma: any) => {
          const machineDoc: any = {
            ...(machineMap.get(String(ma.machineId))?.toObject?.() || machineMap.get(String(ma.machineId)) || {}),
            plantId: this.firstNonEmpty(
              machineMap.get(String(ma.machineId))?.plantId,
              machineMap.get(String(ma.machineId))?.PlantId,
              deviceMap.get(String(ma.machineId))?.plantId,
              deviceMap.get(String(ma.machineId))?.PlantId,
            ),
          };
          const assignmentTenantId = this.firstNonEmpty(ma.tenantId, ma.custId, stageTenantId);
          const shiftDoc = this.findShiftInMap(shiftMap, assignmentTenantId, [ma.shiftId, ma.shift]) || stageShift;
          const assignmentDate = ma.productionDate || ma.startDate || plainStage.productionDate || new Date().toISOString().split('T')[0];
          const shiftEndTime = this.getAssignmentEndTime(assignmentDate, shiftDoc, plainStage.plannedTiming);
          const plantId = this.firstNonEmpty(machineDoc?.plantId, machineDoc?.PlantId, ma.plantId, ma.PlantId);
          return {
            ...ma,
            ...(shiftEndTime !== undefined ? { EndTime: shiftEndTime } : {}),
            ...(plantId ? { plantId, PlantId: plantId } : {}),
          };
        }),
      };
    });
  }

  private setMachineAssignmentStatus(stage: ProcessStage, status: ProcessStageStatus, patch: Record<string, any> = {}) {
    if (!stage.machineAssignments || stage.machineAssignments.length === 0) return;
    stage.machineAssignments = stage.machineAssignments.map((ma: any) => ({
      ...ma,
      ...patch,
      Status: status,
    }));
    stage.markModified('machineAssignments');
  }

  private buildCycleAggAssignmentSummary(records: any[]) {
    const sortedRecords = [...records].sort((a: any, b: any) => this.toNumber(a?.packet_id) - this.toNumber(b?.packet_id));
    const first = sortedRecords[0] || {};
    const last = sortedRecords[sortedRecords.length - 1] || {};
    const summary = sortedRecords.reduce((total: any, record: any) => ({
      partCount: total.partCount + this.toNumber(this.getFirstValue(record, ['partCount', 'partCnt', 'PartCount'])),
      palletCount: this.sumNumberArrays(
        total.palletCount,
        this.toNumberArray(this.getFirstArray(record, ['palletCount', 'palletCnt', 'PalletCount'])),
      ),
    }), { partCount: 0, palletCount: [] });

    return {
      ...summary,
      totalCount: this.diffNumberArrays(
        this.toNumberArray(this.getFirstArray(last, ['totalCount', 'TotalCount'])),
        this.toNumberArray(this.getFirstArray(first, ['totalCount', 'TotalCount'])),
      ),
    };
  }

  private async getCycleAggAssignmentSummary(machineId: string, startTime: any, endTime: any) {
    const start = this.toNumber(startTime, NaN);
    const end = this.toNumber(endTime, NaN);
    if (!machineId || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return { partCount: 0, palletCount: [], totalCount: [] };
    }

    const appDb = this.appConnection.db;
    if (!appDb) return { partCount: 0, palletCount: [], totalCount: [] };
    const records = await appDb.collection('cycleagg')
      .find({
        $and: [
          {
            $or: [
              { gatewayID: machineId },
              { gatewayId: machineId },
              { machineId },
            ],
          },
          { packet_id: { $gte: start, $lte: end } },
        ],
      } as any)
      .sort({ packet_id: 1 })
      .toArray();

    return this.buildCycleAggAssignmentSummary(records);
  }

  private async enrichMachineAssignmentsWithCycleCounts(stage: ProcessStage, status: ProcessStageStatus, patch: Record<string, any> = {}) {
    if (!stage.machineAssignments || stage.machineAssignments.length === 0) return;
    const enriched = await Promise.all(stage.machineAssignments.map(async (ma: any) => {
      const merged = { ...ma, ...patch };
      const counts = await this.getCycleAggAssignmentSummary(merged.machineId, merged.StartTime, merged.EndTime);
      return {
        ...merged,
        ...counts,
        Status: status,
      };
    }));
    stage.machineAssignments = enriched as any;
    stage.markModified('machineAssignments');
  }

  async getMachines(type?: string): Promise<Machine[]> {
    const query: any = {};
    if (type) query.type = type;
    return this.machineModel.find(query).sort({ createdAt: -1 }).exec();
  }




  async createMachine(data: any): Promise<Machine> {
    const existing = await this.machineModel.findOne({ machineId: data.machineId }).exec();
    if (existing) {
      throw new BadRequestException(`Machine with ID ${data.machineId} already exists.`);
    }
    const machine = new this.machineModel(data);
    return machine.save();
  }

  async updateMachine(id: string, data: any): Promise<Machine> {
    const machine = await this.machineModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!machine) throw new NotFoundException('Machine not found');
    return machine;
  }

  async deleteMachine(id: string): Promise<boolean> {
    const result = await this.machineModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Shifts CRUD
  async getShifts(): Promise<Shift[]> {
    return this.shiftModel.find().sort({ createdAt: -1 }).exec();
  }

  private timeToMinutes(time: string): number {
    const fs = require('fs');
    const isValid = /^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(time) || /^([0-9]):[0-5][0-9]$/.test(time);
    fs.appendFileSync('production_debug.log', `[${new Date().toISOString()}] timeToMinutes: "${time}", isValid: ${isValid}\n`);

    if (!time || typeof time !== 'string' || !isValid) {
      throw new BadRequestException(`Invalid time format: "${time}". Please use HH:mm (e.g., 08:30 or 23:59)`);
    }
    const [hrs, mins] = time.split(':').map(Number);
    return hrs * 60 + mins;
  }

  private validateShiftTiming(data: any) {
    console.log('[DEBUG] Validating shift timing:', { startTime: data.startTime, endTime: data.endTime });
    if (!data.startTime || !data.endTime) {
      throw new BadRequestException('Start time and End time are required.');
    }

    const start = this.timeToMinutes(data.startTime);
    let end = this.timeToMinutes(data.endTime);

    // If shift ends next day, add 24 hours in minutes
    if (data.endNextDay) {
      end += 24 * 60;
    }

    if (end <= start) {
      throw new BadRequestException('Shift end time must be after start time. If the shift crosses midnight, please check the "End Next Day" box.');
    }

    if (end - start > 24 * 60) {
      throw new BadRequestException('Shift duration cannot exceed 24 hours.');
    }

    // Validate breaks
    if (data.breaks && Array.isArray(data.breaks)) {
      for (const b of data.breaks) {
        if (!b.breakStartTime || !b.breakEndTime) continue;

        const bStartRaw = this.timeToMinutes(b.breakStartTime);
        let bEndRaw = this.timeToMinutes(b.breakEndTime);

        // Heuristic: if break end < break start, it crosses midnight
        if (bEndRaw < bStartRaw) bEndRaw += 24 * 60;

        let bStart = bStartRaw;
        let bEnd = bEndRaw;

        // If the shift crosses midnight and the break is numerically before the shift start,
        // it must be part of the "next day" portion of the shift.
        if (data.endNextDay && bStart < start) {
          bStart += 24 * 60;
          bEnd += 24 * 60;
        }

        if (bStart < start || bEnd > end) {
          throw new BadRequestException(`Break "${b.breakName || 'Unnamed'}" (${b.breakStartTime} - ${b.breakEndTime}) must fall within shift duration.`);
        }

        // Check for break overlaps
        for (const other of data.breaks) {
          if (b === other) continue;
          if (!other.breakStartTime || !other.breakEndTime) continue;

          const oStart = this.timeToMinutes(other.breakStartTime);
          let oEnd = this.timeToMinutes(other.breakEndTime);
          if (oEnd < oStart) oEnd += 24 * 60;

          if (bStart < oEnd && bEnd > oStart) {
            throw new BadRequestException(`Breaks "${b.breakName}" and "${other.breakName}" overlap.`);
          }
        }
      }
    }
  }

  async createShift(data: any): Promise<Shift> {
    const fs = require('fs');
    fs.appendFileSync('production_debug.log', `[${new Date().toISOString()}] createShift hit with: ${JSON.stringify(data)}\n`);
    try {
      this.validateShiftTiming(data);
    } catch (e) {
      fs.appendFileSync('production_debug.log', `[${new Date().toISOString()}] validateShiftTiming FAILED: ${(e as any)?.message}\n`);
      throw e;
    }

    // Check for overlapping shifts for this tenant
    const existing = await this.shiftModel.find({ tenantId: data.tenantId }).exec();
    const start = this.timeToMinutes(data.startTime);
    let end = this.timeToMinutes(data.endTime);
    if (data.endNextDay) end += 24 * 60;

    for (const s of existing) {
      const sStart = this.timeToMinutes(s.startTime);
      let sEnd = this.timeToMinutes(s.endTime);
      if (s.endNextDay) sEnd += 24 * 60;

      if (start < sEnd && end > sStart) {
        throw new BadRequestException(`Shift overlaps with existing shift: ${s.name}`);
      }
    }

    const shift = await new this.shiftModel(data).save();
    require('fs').appendFileSync('production_debug.log', `[${new Date().toISOString()}] createShift SUCCESS: ${shift._id}\n`);
    return shift;
  }

  async updateShift(id: string, data: any): Promise<Shift> {
    this.validateShiftTiming(data);
    const shift = await this.shiftModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async deleteShift(id: string): Promise<boolean> {
    const result = await this.shiftModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Departments CRUD
  async getDepartments(): Promise<Department[]> {
    return this.departmentModel.find().sort({ createdAt: -1 }).exec();
  }
  async createDepartment(data: any): Promise<Department> {
    const existing = await this.departmentModel.findOne({ departmentId: data.departmentId }).exec();
    if (existing) throw new BadRequestException(`Department with ID ${data.departmentId} already exists.`);
    return new this.departmentModel(data).save();
  }
  async updateDepartment(id: string, data: any): Promise<Department> {
    const doc = await this.departmentModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Department not found');
    return doc;
  }
  async deleteDepartment(id: string): Promise<boolean> {
    const result = await this.departmentModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // MachineTypes CRUD
  async getMachineTypes(): Promise<MachineType[]> {
    return this.machineTypeModel.find().sort({ createdAt: -1 }).exec();
  }
  async createMachineType(data: any): Promise<MachineType> {
    const existing = await this.machineTypeModel.findOne({ machineType: data.machineType }).exec();
    if (existing) throw new BadRequestException(`MachineType ${data.machineType} already exists.`);
    return new this.machineTypeModel(data).save();
  }
  async updateMachineType(id: string, data: any): Promise<MachineType> {
    const doc = await this.machineTypeModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('MachineType not found');
    return doc;
  }
  async deleteMachineType(id: string): Promise<boolean> {
    const result = await this.machineTypeModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Reasons Master CRUD
  async getReasons(): Promise<Reason[]> {
    return this.reasonMasterModel.find().sort({ createdAt: -1 }).exec();
  }
  async createReason(data: any): Promise<Reason> {
    if (data.reasonCode?.trim()) {
      const existing = await this.reasonMasterModel.findOne({ reasonCode: data.reasonCode.trim() }).exec();
      if (existing) throw new BadRequestException(`Reason Code ${data.reasonCode} already exists.`);
      data.reasonCode = data.reasonCode.trim();
    } else {
      // Auto-generate a unique code so the compound unique index never gets a null collision
      const count = await this.reasonMasterModel.countDocuments().exec();
      data.reasonCode = `RSN${String(count + 1).padStart(3, '0')}`;
    }
    // Normalise sub-reasons field name
    const formSubs: any[] = data.subReasons || data.subReason || [];
    data.subReasons = formSubs.map((sr: any) => ({
      subReason: sr.subReason || sr.label || '',
      subReasonCode: sr.subReasonCode || sr.value || (sr.subReason || sr.label || '').toUpperCase().replace(/\s/g, '_'),
    }));
    delete data.subReason;
    return new this.reasonMasterModel(data).save();
  }
  async updateReason(id: string, data: any): Promise<Reason> {
    // Normalise sub-reasons: frontend may send either `subReason` (form field)
    // or `subReasons` (schema field). Always write to schema field `subReasons`.
    const formSubs: any[] = data.subReasons || data.subReason || [];
    const subReasons = formSubs.map((sr: any) => ({
      subReason: sr.subReason || sr.label || '',
      subReasonCode: sr.subReasonCode || sr.value || (sr.subReason || sr.label || '').toUpperCase().replace(/\s/g, '_'),
    }));
    const { subReason: _drop, _id: _dropId, __v: _dropV, ...rest } = data;
    const doc = await this.reasonMasterModel.findByIdAndUpdate(
      id,
      { $set: { ...rest, subReasons } },
      { new: true, runValidators: false },
    ).exec();
    if (!doc) throw new NotFoundException('Reason not found');
    return doc;
  }
  async deleteReason(id: string): Promise<boolean> {
    const result = await this.reasonMasterModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Processes CRUD
  async getProcesses(): Promise<Process[]> {
    return this.processModel.find().sort({ order: 1, createdAt: 1 }).exec();
  }

  async createProcess(data: any): Promise<Process> {
    // Auto-bind custId from tenant context
    const tenantId = tenantContext.getStore();
    if (!data.custId && tenantId) data.custId = tenantId;
    // Auto-generate processId if not provided
    if (!data.processId) {
      const count = await this.processModel.countDocuments().exec();
      data.processId = `process${String(count + 1).padStart(2, '0')}`;
    }
    // Ensure processId is unique within tenant
    const existing = await this.processModel.findOne({ processId: data.processId }).exec();
    if (existing) throw new BadRequestException(`Process ID ${data.processId} already exists.`);
    // Auto-assign order if not provided (append at end)
    if (!data.order) {
      const last = await this.processModel.findOne().sort({ order: -1 }).exec();
      data.order = last ? (last.order || 0) + 1 : 1;
    }
    return new this.processModel(data).save();
  }
  async updateProcess(id: string, data: any): Promise<Process> {
    const doc = await this.processModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Process not found');
    return doc;
  }
  async deleteProcess(id: string): Promise<boolean> {
    const result = await this.processModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // ProgramMasters CRUD
  async getProgramMasters(): Promise<ProgramMaster[]> {
    return this.programMasterModel.find().sort({ createdAt: -1 }).exec();
  }
  async createProgramMaster(data: any): Promise<ProgramMaster> {
    const existing = await this.programMasterModel.findOne({ programId: data.programId }).exec();
    if (existing) throw new BadRequestException(`Program ID ${data.programId} already exists.`);
    return new this.programMasterModel(data).save();
  }
  async updateProgramMaster(id: string, data: any): Promise<ProgramMaster> {
    const doc = await this.programMasterModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('ProgramMaster not found');
    return doc;
  }
  async deleteProgramMaster(id: string): Promise<boolean> {
    const result = await this.programMasterModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Vendors CRUD
  async getVendors(): Promise<Vendor[]> {
    return this.vendorModel.find().sort({ createdAt: -1 }).exec();
  }
  async createVendor(data: any): Promise<Vendor> {
    const existing = await this.vendorModel.findOne({ vendorId: data.vendorId }).exec();
    if (existing) throw new BadRequestException(`Vendor ID ${data.vendorId} already exists.`);
    return new this.vendorModel(data).save();
  }
  async updateVendor(id: string, data: any): Promise<Vendor> {
    const doc = await this.vendorModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Vendor not found');
    return doc;
  }
  async deleteVendor(id: string): Promise<boolean> {
    const result = await this.vendorModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Material Master CRUD
  async getMaterials(): Promise<MaterialMaster[]> {
    return this.materialModel.find().sort({ createdAt: -1 }).exec();
  }
  async createMaterial(data: any): Promise<MaterialMaster> {
    const existing = await this.materialModel.findOne({ materialId: data.materialId }).exec();
    if (existing) throw new BadRequestException(`Material with ID ${data.materialId} already exists.`);
    const material = new this.materialModel(data);
    return material.save();
  }
  async updateMaterial(id: string, data: any): Promise<MaterialMaster> {
    const doc = await this.materialModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Material not found');
    return doc;
  }
  async deleteMaterial(id: string): Promise<boolean> {
    const result = await this.materialModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Part Master CRUD
  async getParts(): Promise<PartMaster[]> {
    return this.partModel.find().sort({ createdAt: -1 }).exec();
  }
  async createPart(data: any): Promise<PartMaster> {
    const existing = await this.partModel.findOne({ partId: data.partId }).exec();
    if (existing) throw new BadRequestException(`Part with ID ${data.partId} already exists.`);

    // Direct creation with all data
    const part = await this.partModel.create({
      ...data,
      weightPerPartKg: Number(data.weightPerPartKg || 0),
      bufferPercent: Number(data.bufferPercent || 0)
    });

    return part;
  }
  async updatePart(id: string, data: any): Promise<PartMaster> {
    const updated = await this.partModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...data,
          weightPerPartKg: Number(data.weightPerPartKg || 0),
          bufferPercent: Number(data.bufferPercent || 0)
        }
      },
      { new: true, strict: false }
    ).exec();

    if (!updated) throw new NotFoundException('Part not found');
    return updated;
  }
  async deletePart(id: string): Promise<boolean> {
    const result = await this.partModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Operators CRUD
  async getOperators(process?: string): Promise<Operator[]> {
    const query: any = { isActive: true };
    if (process && process !== 'ALL') {
      query.process = { $in: [process, 'ALL'] };
    }
    return this.operatorModel.find(query).sort({ name: 1 }).exec();
  }

  async getAllOperators(): Promise<Operator[]> {
    return this.operatorModel.find().sort({ createdAt: -1 }).exec();
  }

  async createOperator(data: any): Promise<Operator> {
    const existing = await this.operatorModel.findOne({ operatorId: data.operatorId }).exec();
    if (existing) {
      throw new BadRequestException(`Operator with ID ${data.operatorId} already exists.`);
    }
    return new this.operatorModel(data).save();
  }

  async updateOperator(id: string, data: any): Promise<Operator> {
    const doc = await this.operatorModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Operator not found');
    return doc;
  }

  async deleteOperator(id: string): Promise<boolean> {
    const result = await this.operatorModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async findAll(type?: ProcessType): Promise<ProcessStage[]> {
    const query: any = {};
    if (type && (type as any) !== 'all' && (type as any) !== 'ALL') query.type = type;

    // We remove restrictive status filters here so that the Work Order screen 
    // can find stages for NOT_STARTED orders. The Pipeline can do its own filtering.
    const stages = await this.stageModel.find(query)
      .sort({ updatedAt: -1 })
      .populate('workOrderId qiUserId pdcUserId')
      .exec();

    console.log(`[ProductionService] findAll found ${stages.length} stages in DB for query:`, JSON.stringify(query));
    if (stages.length > 0) {
      console.log(`[ProductionService] Sample Stage 0 WO ID:`, stages[0].workOrderId?._id || stages[0].workOrderId);
    }
    return this.enrichStageAssignmentsForResponse(stages);
  }

  async checkMachineConflict(machineId: string, date: string, shift: string, tenantId: string, excludeStageId?: string) {
    if (!machineId || !date || !shift) return;

    const query: any = {
      tenantId,
      status: ProcessStageStatus.IN_PROGRESS,
      $or: [
        {
          machineId,
          productionDate: date,
          shift,
          $or: [
            { machineAssignments: { $exists: false } },
            { machineAssignments: { $size: 0 } },
          ],
        },
        {
          machineAssignments: {
            $elemMatch: {
              machineId,
              productionDate: date,
              shift,
              $or: [
                { Status: ProcessStageStatus.IN_PROGRESS },
                { status: ProcessStageStatus.IN_PROGRESS },
                { Status: { $exists: false }, status: { $exists: false } },
              ],
            }
          }
        }
      ]
    };
    if (excludeStageId) {
      query._id = { $ne: excludeStageId };
    }

    const conflict = await this.stageModel.findOne(query).exec();
    if (conflict) {
      throw new BadRequestException(`Machine ${machineId} is already assigned for Shift ${shift} on ${date}.`);
    }
  }

  async earlyEndMachineAssignment(
    id: string,
    userId: string,
    machineId: string,
    productionDate: string,
    shift: string,
    reason: string,
    endTime?: number,
    shiftId?: string,
  ): Promise<ProcessStage> {
    if (!machineId || !productionDate || (!shift && !shiftId)) {
      throw new BadRequestException('Machine, production date, and shift are required.');
    }
    if (!String(reason || '').trim()) {
      throw new BadRequestException('Reason is required to end the current process.');
    }

    const stage = await this.stageModel.findById(id).exec();
    if (!stage) throw new NotFoundException('Stage not found');

    const workOrder = stage.workOrderId
      ? await this.workOrderModel.findById(stage.workOrderId).setOptions({ bypassTenant: true }).exec()
      : null;
    const isSubWorkOrder = stage.workOrderType === WorkOrderType.SUB || workOrder?.type === WorkOrderType.SUB;
    if (!isSubWorkOrder) {
      throw new BadRequestException('Only SUB work order machine assignments can be ended early.');
    }

    const requestedDate = this.toDateOnly(productionDate);
    const requestedShiftKeys = [shift, shiftId].filter(Boolean).map((value) => String(value).trim());
    const now = Number(endTime || Date.now());
    let updated = false;

    stage.machineAssignments = await Promise.all((stage.machineAssignments || []).map(async (ma: any) => {
      const assignmentDate = this.toDateOnly(ma.productionDate || ma.startDate || stage.productionDate);
      const assignmentShiftKeys = [ma.shift, ma.shiftId].filter(Boolean).map((value) => String(value).trim());
      const sameShift = requestedShiftKeys.some((key) => assignmentShiftKeys.includes(key));
      const activeStatus = ma.Status || ma.status || ProcessStageStatus.IN_PROGRESS;
      if (
        String(ma.machineId || '').trim() === String(machineId).trim() &&
        assignmentDate === requestedDate &&
        sameShift &&
        activeStatus === ProcessStageStatus.IN_PROGRESS
      ) {
        updated = true;
        const counts = await this.getCycleAggAssignmentSummary(ma.machineId, ma.StartTime || ma.startTime, now);
        return {
          ...ma,
          ...counts,
          endDate: requestedDate,
          EndTime: now,
          endTime: now,
          Status: ProcessStageStatus.READY_FOR_QI,
          status: ProcessStageStatus.READY_FOR_QI,
          earlyEndReason: String(reason).trim(),
        };
      }
      return ma;
    })) as any;

    if (!updated) {
      throw new BadRequestException('Active machine assignment was not found for this date and shift.');
    }

    const hasActiveAssignments = (stage.machineAssignments || []).some((ma: any) =>
      (ma.Status || ma.status || ProcessStageStatus.IN_PROGRESS) === ProcessStageStatus.IN_PROGRESS
    );
    if (!hasActiveAssignments) {
      stage.status = ProcessStageStatus.READY_FOR_QI;
    }

    stage.markModified('machineAssignments');
    this.appendLog(stage, 'MACHINE_ASSIGNMENT_EARLY_END', userId, undefined, String(reason).trim());
    return stage.save();
  }

  async startStage(id: string, pdcUserId: string, plannedTiming?: string, machineId?: string, machineAssignments?: any[], extraDetails?: any): Promise<ProcessStage> {
    const stage = await this.stageModel.findById(id).exec();
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.status !== ProcessStageStatus.PENDING) {
      throw new BadRequestException('Stage can only be started if it is PENDING');
    }

    const tenantId = stage.tenantId || 'SYSTEM';
    const productionDate = extraDetails?.productionDate || new Date().toISOString().split('T')[0];
    const shift = extraDetails?.shift;
    const assignmentInputs = machineAssignments && machineAssignments.length > 0
      ? machineAssignments
      : machineId
        ? [{
          machineId,
          targetQuantity: extraDetails?.targetPartCount,
          requiredQuantityKg: extraDetails?.requiredQuantityKg,
          operatorId: extraDetails?.operatorId,
          programId: extraDetails?.programId,
          startDate: extraDetails?.startDate || extraDetails?.actualStartDate || productionDate,
          endDate: extraDetails?.endDate || extraDetails?.actualEndDate || productionDate,
          productionDate,
          shift,
          shiftId: extraDetails?.shiftId,
        }]
        : [];

    // Validate conflicts
    if (assignmentInputs.length > 0) {
      for (const ma of assignmentInputs) {
        const maDate = ma.productionDate || ma.startDate || productionDate;
        await this.checkMachineConflict(ma.machineId, maDate, ma.shift || shift, tenantId, id);
      }
    } else if (machineId) {
      await this.checkMachineConflict(machineId, productionDate, shift, tenantId, id);
    }

    stage.status = ProcessStageStatus.IN_PROGRESS;
    stage.pdcUserId = pdcUserId;
    if (plannedTiming) stage.plannedTiming = plannedTiming;
    if (shift) stage.shift = shift;
    if (extraDetails?.shiftId) stage.shiftId = extraDetails.shiftId;
    if (extraDetails?.operatorId) stage.operatorId = extraDetails.operatorId;
    if (extraDetails?.batchNumber) stage.batchNumber = extraDetails.batchNumber;
    if (extraDetails?.masterId) stage.masterId = extraDetails.masterId;
    stage.productionDate = productionDate;

    // Handle machine assignment — single or multi-machine
    if (machineId) stage.machineId = machineId;
    if (assignmentInputs.length > 0) {
      const actualStartTime = Date.now();
      const machineIds = [...new Set(assignmentInputs.map((ma: any) => ma.machineId).filter(Boolean).map(String))];
      const shiftKeys = [
        shift,
        extraDetails?.shiftId,
        ...assignmentInputs.flatMap((ma: any) => [ma.shift, ma.shiftId]),
      ].filter(Boolean).map(String);
      const shiftTenantIds = [
        tenantId,
        stage.tenantId,
        extraDetails?.tenantId,
        extraDetails?.custId,
        ...assignmentInputs.flatMap((ma: any) => [ma.tenantId, ma.custId]),
      ].filter(Boolean).map(String);
      const [machines, devices, shifts] = await Promise.all([
        machineIds.length ? this.machineModel.find({ machineId: { $in: machineIds } }).setOptions({ bypassTenant: true }).exec() : Promise.resolve([]),
        machineIds.length
          ? this.deviceModel.find({
            $or: [
              { gatewayId: { $in: machineIds } },
              { deviceId: { $in: machineIds } },
            ],
          }).setOptions({ bypassTenant: true }).exec()
          : Promise.resolve([]),
        shiftKeys.length
          ? this.shiftModel.find({
            $and: [
              {
                $or: [
                  { shiftId: { $in: shiftKeys } },
                  { name: { $in: shiftKeys } },
                  { _id: { $in: shiftKeys.filter((key) => /^[a-f\d]{24}$/i.test(key)) } },
                ],
              },
              shiftTenantIds.length
                ? { $or: [{ tenantId: { $in: shiftTenantIds } }, { custId: { $in: shiftTenantIds } }] }
                : {},
            ],
          }).setOptions({ bypassTenant: true }).exec()
          : Promise.resolve([]),
      ]);
      const machineMap = new Map(machines.map((machine: any) => [String(machine.machineId), machine]));
      const deviceMap = new Map<string, any>();
      devices.forEach((device: any) => {
        const gatewayKey = this.firstNonEmpty(device.gatewayId, device.deviceId);
        if (gatewayKey) deviceMap.set(String(gatewayKey), device);
      });
      const shiftMap = new Map<string, any>();
      shifts.forEach((shiftItem: any) => this.addShiftToMap(shiftMap, shiftItem));
      stage.machineAssignments = assignmentInputs.map((ma: any) => {
        const assignmentTenantId = this.firstNonEmpty(ma.tenantId, ma.custId, tenantId);
        const shiftDoc = this.findShiftInMap(shiftMap, assignmentTenantId, [ma.shiftId, ma.shift, extraDetails?.shiftId, shift]);
        return this.normalizeMachineAssignment(
          ma,
          { ...extraDetails, plannedTiming, tenantId: assignmentTenantId },
          productionDate,
          shift,
          actualStartTime,
          shiftDoc,
          {
            ...(machineMap.get(String(ma.machineId))?.toObject?.() || machineMap.get(String(ma.machineId)) || {}),
            plantId: this.firstNonEmpty(
              machineMap.get(String(ma.machineId))?.plantId,
              machineMap.get(String(ma.machineId))?.PlantId,
              deviceMap.get(String(ma.machineId))?.plantId,
              deviceMap.get(String(ma.machineId))?.PlantId,
            ),
          },
        );
      });
      // Set primary machineId from first assignment for backward compat
      if (!machineId) stage.machineId = assignmentInputs[0].machineId;
    }

    // Persist excess material received (Die Cast only)
    if (extraDetails?.excessMaterialReceivedKg !== undefined) {
      stage.excessMaterialReceivedKg = Number(extraDetails.excessMaterialReceivedKg);
    }

    // ── Inventory Deduction & WO Status Transition ──
    // Bypass tenant filter to ensure we can link the WO even if headers are inconsistent
    const workOrder = await this.workOrderModel.findById(stage.workOrderId).setOptions({ bypassTenant: true }).exec();
    if (workOrder) {
      console.log(`[ProductionService] WO: ${workOrder._id}, Status: ${workOrder.status}`);

      let detailsUpdated = false;

      // Update WO fields from extraDetails if provided
      if (extraDetails) {
        if (extraDetails.masterId !== undefined && workOrder.masterId !== extraDetails.masterId) {
          workOrder.masterId = extraDetails.masterId;
          detailsUpdated = true;
        }
        if (extraDetails.batchNumber !== undefined && extraDetails.batchNumber !== '' && workOrder.batchNumber !== extraDetails.batchNumber) {
          workOrder.batchNumber = extraDetails.batchNumber;
          detailsUpdated = true;
        }
        if (extraDetails.materialGrade !== undefined && workOrder.materialGrade !== extraDetails.materialGrade) {
          workOrder.materialGrade = extraDetails.materialGrade;
          detailsUpdated = true;
        }
        if (extraDetails.requiredQuantityKg !== undefined && workOrder.requiredQuantityKg !== Number(extraDetails.requiredQuantityKg)) {
          workOrder.requiredQuantityKg = Number(extraDetails.requiredQuantityKg);
          detailsUpdated = true;
        }
        if (extraDetails.bufferKg !== undefined && workOrder.bufferKg !== Number(extraDetails.bufferKg)) {
          workOrder.bufferKg = Number(extraDetails.bufferKg);
          detailsUpdated = true;
        }
        if (extraDetails.weightPerPart !== undefined && workOrder.weightPerPart !== Number(extraDetails.weightPerPart)) {
          workOrder.weightPerPart = Number(extraDetails.weightPerPart);
          detailsUpdated = true;
        }
        if (extraDetails.pricePerPart !== undefined && workOrder.pricePerPart !== Number(extraDetails.pricePerPart)) {
          workOrder.pricePerPart = Number(extraDetails.pricePerPart);
          detailsUpdated = true;
        }
        if (extraDetails.shifts !== undefined) {
          workOrder.shifts = extraDetails.shifts;
          detailsUpdated = true;
        }
        if (extraDetails.machineId !== undefined) {
          workOrder.machineId = extraDetails.machineId;
          detailsUpdated = true;
        }
        if (extraDetails.operatorId !== undefined) {
          workOrder.operatorId = extraDetails.operatorId;
          detailsUpdated = true;
        }
        if (extraDetails.isExternalVendor !== undefined) {
          workOrder.isExternalVendor = extraDetails.isExternalVendor;
          detailsUpdated = true;
        }
        if (extraDetails.vendorName !== undefined) {
          workOrder.vendorName = extraDetails.vendorName;
          detailsUpdated = true;
        }
        if (extraDetails.acceptancePoints !== undefined) {
          workOrder.acceptancePoints = extraDetails.acceptancePoints;
          detailsUpdated = true;
        }
        if (extraDetails.actualMaterialReceivedKg !== undefined) {
          (workOrder as any).actualMaterialReceivedKg = extraDetails.actualMaterialReceivedKg;
          detailsUpdated = true;
        }
        if (extraDetails.actualStartDate !== undefined && workOrder.startDate !== extraDetails.actualStartDate) {
          workOrder.startDate = extraDetails.actualStartDate;
          detailsUpdated = true;
        }
        if (extraDetails.actualEndDate !== undefined && workOrder.endDate !== extraDetails.actualEndDate) {
          workOrder.endDate = extraDetails.actualEndDate;
          detailsUpdated = true;
        }
      }

      const needsStart = workOrder.status === WorkOrderStatus.NOT_STARTED || workOrder.status === WorkOrderStatus.PENDING_APPROVAL;
      const isMissingDeduction = extraDetails?.isFirstStage && !(workOrder as any).isMaterialDeducted;

      // FORCE deduction if it's the first stage and we have material details, 
      // or if it's the first stage and deduction hasn't happened yet.
      const forceDeduction = extraDetails?.isFirstStage && (workOrder.masterId || extraDetails?.masterId);

      if (needsStart || detailsUpdated || forceDeduction || isMissingDeduction) {
        console.log(`[ProductionService] Saving WO details (NeedsStart: ${needsStart}, Updated: ${detailsUpdated}, Forced: ${forceDeduction}) and triggering deduction.`);
        if (needsStart) {
          workOrder.status = WorkOrderStatus.IN_PROGRESS;

          // Propagate IN_PROGRESS status to parent if it's a sub-order
          if (workOrder.parentWorkOrderId) {
            await this.workOrderModel.findByIdAndUpdate(workOrder.parentWorkOrderId, { status: WorkOrderStatus.IN_PROGRESS }).exec();
            console.log(`[ProductionService] Parent Work Order ${workOrder.parentWorkOrderId} propagated to IN_PROGRESS`);
          }
        }
        await workOrder.save();

        // Only deduct if we have a Master ID and quantity
        if (workOrder.masterId && (workOrder.requiredQuantityKg || 0) > 0) {
          await this.inventoryService.deductMaterialForWorkOrder(workOrder._id.toString());
        } else {
          console.warn(`[ProductionService] Skipping batch deduction: MasterID missing or Qty is 0.`);
          const fallbackGrade = workOrder.materialGrade || extraDetails?.materialGrade;
          if (fallbackGrade) await this.inventoryService.syncStockForGrade(fallbackGrade, workOrder.tenantId || 'SYSTEM');
        }
      } else {
        console.log(`[ProductionService] No WO updates needed (Status: ${workOrder.status}). Syncing current stock.`);
        if (workOrder.materialGrade) await this.inventoryService.syncStockForGrade(workOrder.materialGrade, workOrder.tenantId || 'SYSTEM');
      }
    } else {
      console.error(`[ProductionService] CRITICAL: Could not find WorkOrder ${stage.workOrderId} for Stage ${stage._id}`);
    }

    this.appendLog(stage, 'STARTED', pdcUserId, undefined, `Planned timing: ${plannedTiming || 'N/A'}`);
    return stage.save();
  }

  async signalQI(id: string, userId: string, note?: string): Promise<ProcessStage> {
    const stage = await this.stageModel.findById(id).exec();
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.status !== ProcessStageStatus.IN_PROGRESS) {
      throw new BadRequestException('Stage must be IN_PROGRESS to signal QI');
    }

    stage.status = ProcessStageStatus.READY_FOR_QI;

    await this.enrichMachineAssignmentsWithCycleCounts(stage, ProcessStageStatus.READY_FOR_QI, { EndTime: Date.now() });

    this.appendLog(stage, 'READY_FOR_QI', userId, undefined, note || 'Production completed, signaled to QI.');
    return stage.save();
  }

  async autoSignalQiForDueStages(): Promise<number> {
    if (this.autoSignalQiRunning) return 0;
    this.autoSignalQiRunning = true;
    try {
      const now = Date.now();
      const stages = await this.stageModel.find({
        status: ProcessStageStatus.IN_PROGRESS,
        machineAssignments: {
          $elemMatch: {
            EndTime: { $type: 'number', $lte: now },
            Status: ProcessStageStatus.IN_PROGRESS,
          },
        },
      }).setOptions({ bypassTenant: true }).exec();

      let updatedCount = 0;
      for (const stage of stages) {
        const assignments = stage.machineAssignments || [];
        const finiteEndTimes = assignments
          .map((ma: any) => Number(ma.EndTime))
          .filter((value) => Number.isFinite(value));
        if (!finiteEndTimes.length || finiteEndTimes.some((value) => value > now)) continue;

        stage.status = ProcessStageStatus.READY_FOR_QI;
        await this.enrichMachineAssignmentsWithCycleCounts(stage, ProcessStageStatus.READY_FOR_QI);
        this.appendLog(
          stage,
          'READY_FOR_QI',
          'SYSTEM_AUTO_QI',
          undefined,
          'Automatically signaled to QI because assignment EndTime reached system time.',
        );
        await stage.save();
        updatedCount += 1;
      }
      return updatedCount;
    } finally {
      this.autoSignalQiRunning = false;
    }
  }

  async submitQI(id: string, data: any, qiUserId: string): Promise<ProcessStage> {
    const stage = await this.stageModel.findById(id).exec();
    if (!stage) throw new NotFoundException('Stage not found');

    // Allow submission only after production has been sent to QI.
    const allowedStatuses = [ProcessStageStatus.READY_FOR_QI, ProcessStageStatus.QI_SUBMITTED, ProcessStageStatus.PDC_VERIFIED];
    
    // Final QA can submit QI directly from IN_PROGRESS without waiting for a PDC signal
    if (stage.type === 'FINAL_QA') {
      allowedStatuses.push(ProcessStageStatus.IN_PROGRESS);
    }
    
    if (stage.type !== 'FINAL_QA' && !allowedStatuses.includes(stage.status)) {
      throw new BadRequestException('QI can only be submitted after the stage is sent to QI');
    }

    // Validate rejection reason required when there are rejections
    if ((data.rejectedPartsCount || 0) > 0 && (!data.rejectionReasons || data.rejectionReasons.length === 0)) {
      throw new BadRequestException('Rejection reason is required when rejected parts > 0');
    }

    // Validate scrap reason required when there is scrap weight
    if ((data.scrapWeightKg || 0) > 0 && (!data.scrapReasons || data.scrapReasons.length === 0)) {
      throw new BadRequestException('Scrap reason is required when scrap weight > 0');
    }

    const workOrder = await this.workOrderModel.findById(stage.workOrderId).setOptions({ bypassTenant: true }).exec();
    const weightPerPart = workOrder?.weightPerPart || 0;
    const pricePerPart = workOrder?.pricePerPart || 0;

    const goodPartsCount = data.goodPartsCount || 0;
    const rejectedPartsCount = data.rejectedPartsCount || 0;
    const reworkPartsCount = data.reworkPartsCount || 0;

    // Create new partial submission
    const submission: any = {
      timestamp: new Date(),
      qiUserId,
      machineId: data.machineId,
      goodPartsCount,
      reworkPartsCount,
      rejectedPartsCount,
      scrapWeightKg: data.scrapWeightKg !== undefined ? data.scrapWeightKg : (rejectedPartsCount * weightPerPart),
      outputQuantity: data.outputQuantity || (goodPartsCount + reworkPartsCount + rejectedPartsCount),
      outputCount: data.outputCount || 0,
      outputWeightKg: data.outputWeightKg !== undefined ? data.outputWeightKg : (goodPartsCount * weightPerPart),
      productionValue: data.productionValue !== undefined ? data.productionValue : (goodPartsCount * pricePerPart),
      rejectionReasons: data.rejectionReasons || [],
      reworkReasons: data.reworkReasons || [],
      scrapReasons: data.scrapReasons || [],
      processId: stage.type,
      shift: data.shift || stage.shift,
      productionDate: data.productionDate || stage.productionDate,
      isVerified: false
    };

    if (!stage.submissions) stage.submissions = [];
    stage.submissions.push(submission);

    // Update status to indicate there is a pending verification
    stage.status = ProcessStageStatus.QI_SUBMITTED;
    this.setMachineAssignmentStatus(stage, ProcessStageStatus.QI_SUBMITTED);

    this.appendLog(stage, 'QI_SUBMITTED_PARTIAL', qiUserId, undefined,
      `Batch Submitted - Good: ${data.goodPartsCount}, Rework: ${data.reworkPartsCount}, Rejected: ${data.rejectedPartsCount}. Total submissions: ${stage.submissions.length}`
    );

    // Trigger explicit escalation if rejection rate is high in this batch
    const totalInput = submission.outputQuantity;
    if (totalInput > 0 && data.rejectedPartsCount / totalInput > 0.10) {
      await this.notificationService.triggerEscalation('HIGH_REJECTION', {
        workOrderId: stage.workOrderId,
        process: stage.type,
        rejectedPartsCount: data.rejectedPartsCount,
        reasons: data.rejectionReasons || ['Multiple Quality Issues']
      });
    }

    // Update isBufferApplied in WorkOrder if this is Die Casting
    if (stage.type === ProcessType.DIE_CASTING) {
      await this.workOrderModel.findByIdAndUpdate(stage.workOrderId, { $set: { isBufferApplied: true } }).setOptions({ bypassTenant: true }).exec();
    }

    await stage.save();

    if (stage.type === 'FINAL_QA') {
      return this.approveQI(id, qiUserId);
    }

    return stage;
  }

  async approveQI(id: string, pdcUserId: string): Promise<ProcessStage> {
    const stage = await this.stageModel.findById(id).exec().then(s => s?.populate('workOrderId'));
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.status !== ProcessStageStatus.QI_SUBMITTED) {
      throw new BadRequestException('Stage must be in QI_SUBMITTED status to approve');
    }

    const workOrder = stage.workOrderId as any;
    const tenantId = stage.tenantId || 'SYSTEM';

    // Force calculation even if no pending submissions exist, this acts as a self-healing mechanism
    ////fs.appendFileSync('debug.log', `[${new Date().toISOString()}] approveQI started for Stage ${id}\n`);
    console.log(`[ProductionService] Verifying pending batches for Stage ${id}`);

    const weightPerPart = (workOrder?.weightPerPart) || 0;
    const newlyVerified: any[] = [];

    try {
      // Process ALL unverified submissions using map to ensure Mongoose detects changes
      ////fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Stage submissions count: ${stage.submissions.length}\n`);
      const updatedSubmissions = stage.submissions.map((sub, idx) => {
        // Convert to plain object if it's a mongoose subdoc to allow easy mutation and reassignment
        const plainSub = (sub as any).toObject ? (sub as any).toObject() : sub;

        //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Checking sub ${idx}, isVerified: ${plainSub.isVerified}\n`);
        if (!plainSub.isVerified) {
          //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Verifying sub ${idx}\n`);
          // 1. Return scrap weight to inventory stock
          if (plainSub.scrapWeightKg > 0 && workOrder?.materialGrade && workOrder?.masterId) {
            //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Returning scrap weight: ${plainSub.scrapWeightKg}\n`);
            this.inventoryService.returnMaterialToStock(workOrder.masterId, workOrder.materialGrade, plainSub.scrapWeightKg, tenantId).catch(e => {
              //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Inventory scrap error: ${e.message}\n`);
              console.error('Inventory scrap return failed:', e);
            });
          }

          // 2. Return rejected parts weight to inventory
          const rejectedCount = plainSub.rejectedPartsCount || 0;
          const rejectedKg = rejectedCount * weightPerPart;
          if (rejectedKg > 0 && workOrder?.materialGrade && workOrder?.masterId) {
            //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Returning rejected weight: ${rejectedKg}\n`);
            this.inventoryService.returnMaterialToStock(workOrder.masterId, workOrder.materialGrade, rejectedKg, tenantId).catch(e => {
              //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Inventory rejection error: ${e.message}\n`);
              console.error('Inventory rejection return failed:', e);
            });
          }

          // Mark as verified
          plainSub.isVerified = true;
          plainSub.verifiedBy = pdcUserId;
          plainSub.verifiedAt = new Date();
          newlyVerified.push(plainSub);
        }
        return plainSub;
      });

      stage.submissions = updatedSubmissions as any;
      stage.markModified('submissions');

      // 3. Recalculate aggregate counts from ALL verified submissions
      const verifiedSubs = stage.submissions.filter(s => s.isVerified);
      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Verified subs count: ${verifiedSubs.length}\n`);

      const totalGood = verifiedSubs.reduce((sum, s) => sum + (s.goodPartsCount || 0), 0);
      const totalRework = verifiedSubs.reduce((sum, s) => sum + (s.reworkPartsCount || 0), 0);
      const totalRejected = verifiedSubs.reduce((sum, s) => sum + (s.rejectedPartsCount || 0), 0);

      stage.goodPartsCount = totalGood;
      stage.reworkPartsCount = totalRework;
      stage.rejectedPartsCount = totalRejected;
      stage.outputQuantity = totalGood + totalRework + totalRejected;

      stage.outputWeightKg = verifiedSubs.reduce((sum, s) => sum + (s.outputWeightKg || 0), 0);
      stage.scrapWeightKg = verifiedSubs.reduce((sum, s) => sum + (s.scrapWeightKg || 0), 0);
      (stage as any).productionValue = verifiedSubs.reduce((sum, s) => sum + (s.productionValue || 0), 0);

      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Recalculated totalGood: ${totalGood}, outputQuantity: ${stage.outputQuantity}, productionValue: ${(stage as any).productionValue}\n`);
      console.log(`[ProductionService] Total Good: ${totalGood}. Production Value: ${(stage as any).productionValue}`);

      // 4. Update Stage Status
      const targetQty = stage.inputQuantity || 0;
      const hasUnverified = stage.submissions.some(s => !s.isVerified);
      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] targetQty: ${targetQty}, hasUnverified: ${hasUnverified}\n`);

      const totalDone = totalGood + totalRejected;
      // Rework parts are forwarded to a REWORK sub-WO (spawned below), so count them as accounted for
      const totalAccountedFor = totalDone + totalRework;

      if (hasUnverified) {
        stage.status = ProcessStageStatus.QI_SUBMITTED;
      } else if (totalAccountedFor < targetQty) {
        // Genuine partial batch — more parts still unsubmitted on this stage
        stage.status = ProcessStageStatus.IN_PROGRESS;
      } else {
        stage.status = ProcessStageStatus.PDC_VERIFIED;
      }
      this.setMachineAssignmentStatus(stage, stage.status);

      stage.pdcUserId = pdcUserId;

      this.appendLog(stage, 'PDC_VERIFIED_ALL', pdcUserId, undefined,
        `Verified all pending batches. Total Good: ${totalGood}. Status: ${stage.status}`
      );

      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Saving stage... status will be ${stage.status}\n`);
      await stage.save();
      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Stage saved successfully.\n`);
    } catch (error: any) {
      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] CRITICAL ERROR in approveQI: ${error.message}\n${error.stack}\n`);
      throw error;
    }

    // 5. Sync PartInventory and spawn rework for NEWLY verified batches
    for (const sub of newlyVerified) {
      try {
        await this.inventoryService.updatePartInventory({
          partId: workOrder.partId,
          shift: workOrder.shift || 'N/A',
          date: new Date().toISOString().split('T')[0],
          processType: stage.type,
          goodCount: sub.goodPartsCount, // sync the batch good count
          rejectionDetails: sub.rejectionReasons,
          reworkDetails: sub.reworkReasons,
          tenantId: stage.tenantId
        });
        console.log(`[ProductionService] Synced PartInventory for verified batch in stage ${stage._id}`);
      } catch (e) {
        console.error(`[ProductionService] Failed to sync PartInventory:`, e);
      }
    }

    // 6. Spawn REWORK sub-work-order when the verified batch has rework parts
    if (stage.reworkPartsCount > 0) {
      try {
        // Prevent duplicate: check if a rework stage already exists for this parent stage
        const existingRework = await this.stageModel.findOne({
          parentStageId: String(stage._id),
          tenantId: stage.tenantId,
        }).exec();

        if (!existingRework) {
          const reworkCycleNum = (stage.reworkCycle || 0) + 1;

          // Create REWORK WorkOrder — no material deduction (parts already produced)
          const reworkWoDoc = new this.workOrderModel({
            partId: workOrder.partId,
            workOrderId: `RW-${workOrder.workOrderId}-C${reworkCycleNum}`,
            type: WorkOrderType.REWORK,
            parentWorkOrderId: workOrder._id,
            mainWorkOrderId: workOrder.mainWorkOrderId || workOrder.workOrderId,
            targetPartCount: stage.reworkPartsCount,
            status: WorkOrderStatus.IN_PROGRESS,
            processType: stage.type,
            startDate: new Date(),
            tenantId: stage.tenantId,
            weightPerPart: workOrder.weightPerPart || 0,
            pricePerPart: workOrder.pricePerPart || 0,
          });
          const reworkWo = await reworkWoDoc.save();

          // Create PENDING ProcessStage for the rework cycle
          await this.createStage({
            workOrderId: reworkWo._id,
            type: stage.type,
            inputQuantity: stage.reworkPartsCount,
            reworkCycle: reworkCycleNum,
            parentStageId: String(stage._id),
            status: ProcessStageStatus.PENDING,
            tenantId: stage.tenantId,
            stageLog: [{
              action: 'CREATED_REWORK',
              actorId: pdcUserId,
              timestamp: new Date(),
              note: `Rework cycle ${reworkCycleNum} spawned: ${stage.reworkPartsCount} parts from stage ${stage._id}`,
            }],
          });

          console.log(`[ProductionService] Spawned REWORK sub-WO "${reworkWo.workOrderId}" for ${stage.reworkPartsCount} parts`);
        } else {
          console.log(`[ProductionService] REWORK stage already exists for stage ${stage._id}, skipping spawn`);
        }
      } catch (e) {
        console.error(`[ProductionService] Failed to spawn rework sub-WO:`, e);
      }
    }

    return stage;
  }

  async managerRouteStage(id: string, nextType: string | null, isRework: boolean = false): Promise<ProcessStage> {
    //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] managerRouteStage started for Stage ${id}. nextType: ${nextType}\n`);
    try {
      const stage = await this.stageModel.findById(id).exec().then(s => s?.populate('workOrderId'));
      if (!stage) {
        //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] ERROR: Stage not found\n`);
        throw new NotFoundException('Stage not found');
      }

      const totalDone = (stage.goodPartsCount || 0) + (stage.rejectedPartsCount || 0);
      const targetQty = stage.inputQuantity || 0;

      // Allow routing of already verified good parts even if there are pending QI submissions
      // We only check if there are new good parts available below.

      // Block routing if no verified good parts available to forward
      const alreadyRouted = (stage as any).routedPartsCount || 0;
      const deltaGood = stage.goodPartsCount - alreadyRouted;
      if (deltaGood <= 0 && !isRework) {
        throw new BadRequestException('No new good parts to forward. All verified output has already been routed.');
      }

      // ── Forward-only guard (Dynamic) ──────────────────────────────────────────
      if (nextType) {
        const tenantProcesses = await this.processModel
          .find({ tenantId: stage.tenantId })
          .sort({ order: 1, createdAt: 1 })
          .exec();

        const processSequence = tenantProcesses.map(p => p.processId);
        const currentIdx = processSequence.indexOf(stage.type as any);
        const nextIdx = processSequence.indexOf(nextType as any);

        if (currentIdx !== -1 && nextIdx !== -1 && nextIdx <= currentIdx) {
          throw new BadRequestException(
            `Cannot route backward in configured flow: ${stage.type} → ${nextType}.`
          );
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // Determine if all machines are done — only then COMPLETE the stage
      const isFullyDone = totalDone >= targetQty;
      if (isFullyDone) {
        stage.status = ProcessStageStatus.COMPLETED;
      }
      this.setMachineAssignmentStatus(stage, stage.status);
      // For partial routing (multi-machine), stage stays IN_PROGRESS
      (stage as any).routedPartsCount = stage.goodPartsCount;

      this.appendLog(stage, isFullyDone ? 'COMPLETED' : 'PARTIAL_ROUTE', 'SYSTEM', undefined,
        isRework
          ? `Rework cycle — ${stage.reworkPartsCount} parts sent back to ${stage.type}`
          : nextType
            ? `Good output (${deltaGood} parts) forwarded to ${nextType}. Total routed: ${stage.goodPartsCount}/${targetQty}`
            : `Work Order signed off. No further stages.`
      );
      await stage.save();

      const workOrder = stage.workOrderId as any;

      if (nextType) {
        if (deltaGood > 0) {
          // Find existing PENDING next stage for this WO to add to, otherwise create new
          const existingNextStage = await this.stageModel.findOne({
            workOrderId: workOrder._id,
            type: nextType,
            status: ProcessStageStatus.PENDING,
            tenantId: stage.tenantId,
          }).exec();

          if (existingNextStage) {
            existingNextStage.inputQuantity = (existingNextStage.inputQuantity || 0) + deltaGood;
            this.appendLog(existingNextStage as any, 'INPUT_UPDATED', 'SYSTEM', undefined,
              `Input quantity updated +${deltaGood} from ${stage.type} partial route. Total: ${existingNextStage.inputQuantity}`
            );
            await existingNextStage.save();
          } else {
            await this.createStage({
              workOrderId: workOrder._id,
              type: nextType,
              inputQuantity: deltaGood,
              reworkCycle: 0,
              tenantId: stage.tenantId,
              stageLog: [{
                action: 'CREATED_FROM_PREV_STAGE',
                actorId: 'SYSTEM',
                timestamp: new Date(),
                note: `Auto-input from ${stage.type} stage. Good output: ${deltaGood} parts.`,
              }],
            });
          }
        }
      } else if (isFullyDone) {
        // No next stage and fully done — complete the Work Order
        await this.workOrderModel.findByIdAndUpdate(workOrder._id, { status: WorkOrderStatus.COMPLETED }).exec();
        console.log(`[ProductionService] Work Order ${workOrder._id} marked COMPLETED`);

        if (workOrder.parentWorkOrderId) {
          const siblings = await this.workOrderModel.find({
            parentWorkOrderId: workOrder.parentWorkOrderId,
            _id: { $ne: workOrder._id }
          }).exec();

          const allSiblingsCompleted = siblings.every(s => s.status === WorkOrderStatus.COMPLETED);
          if (allSiblingsCompleted) {
            await this.workOrderModel.findByIdAndUpdate(workOrder.parentWorkOrderId, { status: WorkOrderStatus.COMPLETED }).exec();
            console.log(`[ProductionService] Parent Work Order ${workOrder.parentWorkOrderId} propagated to COMPLETED`);
          }
        }
      }

      return stage;
    } catch (error: any) {
      //fs.appendFileSync('debug.log', `[${new Date().toISOString()}] CRITICAL ERROR in managerRouteStage: ${error.message}\n${error.stack}\n`);
      throw error;
    }
  }

  async createStage(data: any): Promise<ProcessStage> {
    let enrichedData = data;
    if (data?.workOrderId && (!data.workOrderNumber || !data.workOrderType || !data.masterId || !data.partId)) {
      const workOrder = await this.workOrderModel.findById(data.workOrderId).setOptions({ bypassTenant: true }).exec();
      if (workOrder) {
        enrichedData = {
          ...data,
          workOrderNumber: data.workOrderNumber || workOrder.workOrderId,
          workOrderType: data.workOrderType || workOrder.type,
          mainWorkOrderId: data.mainWorkOrderId || workOrder.mainWorkOrderId || workOrder.workOrderId,
          masterId: data.masterId || workOrder.masterId,
          partId: data.partId || workOrder.partId,
        };
      }
    }
    const stage = new this.stageModel(enrichedData);
    return stage.save();
  }

  async isMachineOccupied(machineId: string): Promise<boolean> {
    const activeStage = await this.stageModel.findOne({
      $and: [
        {
          $or: [
            { machineId: machineId },
            { 'machineAssignments.machineId': machineId }
          ]
        },
        {
          status: { $in: [ProcessStageStatus.IN_PROGRESS, ProcessStageStatus.QI_SUBMITTED] }
        }
      ]
    }).exec();

    return !!activeStage;
  }

  async getMachineAnalytics(from?: string, to?: string): Promise<any[]> {
    const machines = await this.machineModel.find().exec();

    // 1. Get currently active stages to identify which machine is "PROCESSING"
    const activeStages = await this.stageModel.find({
      status: { $in: [ProcessStageStatus.PENDING, ProcessStageStatus.IN_PROGRESS, ProcessStageStatus.QI_SUBMITTED, ProcessStageStatus.PDC_VERIFIED] }
    }).exec();

    const machineToActiveStage = new Map<string, any>();
    activeStages.forEach(s => {
      const mid = String(s.machineId || '').trim().toUpperCase();
      if (mid && !machineToActiveStage.has(mid)) machineToActiveStage.set(mid, s);
      if (s.machineAssignments) {
        s.machineAssignments.forEach(a => {
          const amid = String(a.machineId || '').trim().toUpperCase();
          if (amid && !machineToActiveStage.has(amid)) machineToActiveStage.set(amid, s);
        });
      }
    });

    const finalResults = await Promise.all(machines.map(async m => {
      const machineKey = String(m.machineId || '').trim().toUpperCase();
      const activeStage = machineToActiveStage.get(machineKey);

      // DIRECT FETCH from collection bypassing all Mongoose filters
      const rawWOs = await this.workOrderModel.collection.find({
        tenantId: m.tenantId,
        $or: [
          { machineId: m.machineId },
          { machineId: machineKey }
        ]
      }).sort({ createdAt: -1 }).limit(50).toArray();

      const woHistory = rawWOs.map(wo => ({
        id: String(wo._id),
        partId: wo.partId,
        target: wo.targetPartCount,
        status: wo.status,
        producedQty: 0,
        process: wo.initialStage || 'DIE_CASTING',
        startDate: wo.startDate,
        endDate: wo.endDate
      }));

      // Find active WO document specifically if it's currently running
      let activeWODoc: any = null;
      if (activeStage?.workOrderId) {
        const activeId = String(activeStage.workOrderId);
        const found = rawWOs.find(wo => String(wo._id) === activeId);
        if (found) {
          activeWODoc = found;
        } else {
          activeWODoc = await this.workOrderModel.findById(activeId).exec();
          if (activeWODoc) {
            woHistory.push({
              id: String(activeWODoc._id),
              partId: activeWODoc.partId,
              target: activeWODoc.targetPartCount,
              status: activeWODoc.status,
              producedQty: 0,
              process: activeStage.type,
              startDate: activeWODoc.startDate,
              endDate: activeWODoc.endDate
            });
          }
        }
      }

      return {
        id: String(m._id),
        machineId: m.machineId,
        name: m.name,
        type: m.type,
        status: activeStage ? 'PROCESSING' : (m.status === 'ACTIVE' ? 'IDLE' : 'OFFLINE'),
        producedCount: 0,
        currentWorkOrder: activeWODoc ? {
          id: String(activeWODoc._id),
          partId: activeWODoc.partId,
          target: activeWODoc.targetPartCount,
          status: activeWODoc.status,
          producedQty: activeStage ? (Number(activeStage.goodPartsCount) || 0) + (Number(activeStage.reworkPartsCount) || 0) + (Number(activeStage.rejectedPartsCount) || 0) : 0,
          process: activeStage?.type || activeWODoc.initialStage,
          startDate: activeWODoc.startDate,
          endDate: activeWODoc.endDate
        } : null,
        workOrders: woHistory.sort((a, b) => {
          const da = new Date(a.startDate || 0).getTime();
          const db = new Date(b.startDate || 0).getTime();
          return db - da;
        }),
        lastUpdated: m.updatedAt
      };
    }));
    console.log(`[ProductionService] Machine analytics generated for ${finalResults.length} machines.`);
    return finalResults;
  }

  async getQualityReasons(type?: string, category?: string): Promise<QualityReason[]> {
    const query: any = {};
    if (type && type !== 'ALL') query.processType = { $in: [type, 'ALL'] };
    if (category) query.category = category;
    return this.reasonModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async createQualityReason(data: any): Promise<QualityReason> {
    return new this.reasonModel(data).save();
  }

  async autoSubmitExpiredSWOs() {
    const now = new Date();
    const activeStages = await this.stageModel.find({
      status: ProcessStageStatus.IN_PROGRESS,
      shiftId: { $exists: true }
    }).exec();

    for (const stage of activeStages) {
      try {
        const shift = await this.shiftModel.findById(stage.shiftId).exec();
        if (!shift) continue;

        // Parse shift end time
        const [h, m] = shift.endTime.split(':').map(Number);
        const shiftEnd = new Date(now);
        shiftEnd.setHours(h, m, 0, 0);

        if (shift.endNextDay && now.getHours() < h) {
          // If it's early morning and shift ended "next day" (e.g. ends 6am, now is 8am)
          // If now.hours < h, shiftEnd is already correct. 
          // If now.hours >= h, shiftEnd should be today.
        } else if (shift.endNextDay) {
          // Not used yet, need more complex logic for cross-day shifts
        }

        const bufferMins = 10;
        const autoSubmitTime = new Date(shiftEnd.getTime() + bufferMins * 60000);

        if (now > autoSubmitTime) {
          console.log(`[ProductionService] Auto-submitting stage ${stage._id} (Shift ${shift.name} ended at ${shift.endTime})`);
          // Default all input to good parts for auto-submission
          await this.submitQI(stage._id.toString(), {
            goodPartsCount: stage.inputQuantity || 0,
            outputQuantity: stage.inputQuantity || 0,
            outputCount: 1, // Default
            outputWeightKg: (stage.inputQuantity || 0) * 0.1, // Placeholder
          }, 'SYSTEM_AUTO');
        }
      } catch (e) {
        console.error(`[ProductionService] Auto-submission failed for stage ${stage._id}:`, e);
      }
    }
  }
}
