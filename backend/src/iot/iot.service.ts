import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as mqtt from 'mqtt';
import { tenantContext } from '../shared/tenant.context';
import { HourData } from './schemas/hourdata.schema';
import { EquipmentAgg } from './schemas/equipmentagg.schema';
import { Device } from './schemas/device.schema';
import { OTAConfig } from './schemas/ota-config.schema';
import { DeviceGateway } from './schemas/device-gateway.schema';
import { ProcessStage, ProcessStageStatus } from '../production/schemas/process-stage.schema';
import { Shift } from '../production/schemas/shift.schema';

@Injectable()
export class IotService {
  private readonly gatewayControlCommands = new Map<string, number>([
    ['RESET:FACTORY', 1],
    ['RESET:GATEWAY', 2],
    ['RESET:CONFIG', 3],
    ['RESET:OUTPIN', 4],
    ['SET:OTA', 5],
    ['SET:OUTPIN', 6],
    ['SET:LOG', 7],
  ]);

  constructor(
    @InjectModel(HourData.name, 'iot') private hourModel: Model<HourData>,
    @InjectModel(EquipmentAgg.name, 'iot') private eqModel: Model<EquipmentAgg>,
    @InjectModel(OTAConfig.name, 'iot') private iotOtaModel: Model<OTAConfig>,
    @InjectModel(Device.name) private deviceModel: Model<Device>,
    @InjectModel(OTAConfig.name) private otaModel: Model<OTAConfig>,
    @InjectModel(DeviceGateway.name) private gatewayModel: Model<DeviceGateway>,
    @InjectModel(ProcessStage.name) private stageModel: Model<ProcessStage>,
    @InjectModel(Shift.name) private shiftModel: Model<Shift>,
    @InjectConnection() private appConnection: Connection,
  ) { }

  private buildDateRange(date?: string, startTime?: string, endTime?: string) {
    const start = startTime ? new Date(startTime) : new Date(`${date || new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const end = endTime ? new Date(endTime) : new Date(`${date || new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);
    return { start, end, startMs: start.getTime(), endMs: end.getTime() };
  }

  private getDocId(doc: any): string {
    return String(doc?._id || doc?.id || '');
  }

  private getAssignmentForMachine(stage: any, machineId: string) {
    const normalized = String(machineId || '').trim().toUpperCase();
    return (stage.machineAssignments || []).find((assignment: any) =>
      String(assignment.machineId || '').trim().toUpperCase() === normalized
    );
  }

  private toWorkOrderSummary(stage: any, assignment?: any) {
    const wo = stage.workOrderId && typeof stage.workOrderId === 'object' ? stage.workOrderId : null;
    const target = Number(assignment?.qty ?? stage.inputQuantity ?? wo?.targetPartCount ?? 0);
    const producedQty =
      Number(stage.goodPartsCount || 0) +
      Number(stage.reworkPartsCount || 0) +
      Number(stage.rejectedPartsCount || 0);

    return {
      id: this.getDocId(wo) || String(stage.workOrderId || ''),
      _id: this.getDocId(wo) || String(stage.workOrderId || ''),
      workOrderId: wo?.workOrderId || this.getDocId(wo) || String(stage.workOrderId || ''),
      partId: wo?.partId || '',
      target,
      targetPartCount: target,
      producedQty,
      process: stage.type,
      status: wo?.status || stage.status,
      stageStatus: stage.status,
      startDate: assignment?.startDate || wo?.startDate || stage.createdAt,
      endDate: assignment?.endDate || wo?.endDate,
      shifts: [assignment?.shiftId, assignment?.shift, stage.shiftId, stage.shift].filter(Boolean),
      machineAssignments: stage.machineAssignments || [],
    };
  }

  private getStatusColor(name?: string) {
    const normalized = String(name || '').toLowerCase();
    if (normalized.includes('running')) return '#548237';
    if (normalized.includes('idle')) return '#808080';
    if (normalized.includes('off')) return '#b0b0b0';
    if (normalized.includes('standby')) return '#f54c4c';
    if (normalized.includes('disconnect')) return '#b0b0b0';
    if (normalized.includes('breakdown')) return '#eb5857';
    return '#808080';
  }

  private normalizeItemStyle(row: any) {
    const existingColor = row?.itemStyle?.normal?.color || row?.itemStyle?.color;
    return {
      ...(row?.itemStyle || {}),
      normal: {
        ...(row?.itemStyle?.normal || {}),
        color: existingColor || this.getStatusColor(row?.name),
      },
    };
  }

  private flattenEquipmentStatus(records: any[], startMs: number, endMs: number) {
    return records
      .flatMap((record: any) => {
        const rows = Array.isArray(record.overall_status) ? record.overall_status : [record];
        return rows.map((row: any) => ({
          ...row,
          itemStyle: this.normalizeItemStyle(row),
          gatewayID: row.gatewayID || row.gatewayId || record.gatewayID || record.gatewayId,
          customerID: row.customerID || record.customerID,
        }));
      })
      .filter((row: any) => {
        const rowStart = Number(row?.value?.[1] ?? row?.packet_id ?? row?.startTime ?? 0);
        const rowEnd = Number(row?.value?.[2] ?? row?.endTime ?? rowStart);
        return rowStart <= endMs && rowEnd >= startMs;
      })
      .sort((a: any, b: any) =>
        Number(a?.value?.[1] ?? a?.packet_id ?? 0) - Number(b?.value?.[1] ?? b?.packet_id ?? 0)
      );
  }

  private normalizeHourlyRecords(records: any[]) {
    return records.map((record: any) => {
      const hourText = String(record.hourRecord || record.segmentRecord || '');
      const hourNumber = Number(record.hourNumber ?? hourText.split(':')[0]);
      return {
        ...record,
        gatewayId: record.gatewayId || record.gatewayID || record.machineId,
        sourceDate: record.sourceDate || record.hourRecordDate || record.date,
        hourNumber: Number.isFinite(hourNumber) ? hourNumber : 0,
        partProduced: Number(record.partProduced ?? record.PartProduced ?? record.partCount ?? 0),
        partRejected: Number(record.partRejected ?? record.PartRejected ?? 0),
        oEE: Number(record.oEE ?? record.OEE ?? 0),
        availability: Number(record.availability ?? record.Availability ?? 0),
        performance: Number(record.performance ?? record.Performance ?? 0),
        quality: Number(record.quality ?? record.Quality ?? 0),
      };
    });
  }

  private getStatusKey(name?: string) {
    return String(name || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  private buildStatusChartData(statusData: any[]) {
    const totals = new Map<string, { status: string; status_name: string; duration: number }>();

    statusData.forEach((row: any) => {
      const statusName = String(row?.name || 'Unknown');
      const status = this.getStatusKey(statusName);
      const start = Number(row?.value?.[1] ?? row?.segmentStartTs ?? row?.packet_id ?? 0);
      const end = Number(row?.value?.[2] ?? row?.segmentEndTs ?? start);
      const duration = Math.max((end - start) / 1000, 0);
      if (!duration) return;

      const current = totals.get(status) || { status, status_name: statusName, duration: 0 };
      current.duration += duration;
      totals.set(status, current);
    });

    const totalDuration = Array.from(totals.values()).reduce((sum, item) => sum + item.duration, 0);
    return Array.from(totals.values()).map((item) => ({
      status: item.status,
      status_name: item.status_name,
      percent: totalDuration ? Number(((item.duration / totalDuration) * 100).toFixed(2)) : 0,
      duration: Number(item.duration.toFixed(2)),
    }));
  }

  private toNumber(value: any) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private toNumberArray(value: any) {
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

  private buildCycleAggSummary(records: any[]) {
    const sortedRecords = [...records].sort((a: any, b: any) => this.toNumber(a?.packet_id) - this.toNumber(b?.packet_id));
    const latest = sortedRecords[sortedRecords.length - 1] || {};

    return sortedRecords.reduce((summary: any, record: any) => ({
      ...summary,
      partCount: summary.partCount + this.toNumber(this.getFirstValue(record, ['partCount', 'partCnt', 'PartCount'])),
      palletCount: this.sumNumberArrays(
        summary.palletCount,
        this.toNumberArray(this.getFirstArray(record, ['palletCount', 'palletCnt', 'PalletCount']))
      ),
      packetValidCount: this.sumNumberArrays(
        summary.packetValidCount,
        this.toNumberArray(this.getFirstArray(record, ['packetValidCount', 'PacketValidCount']))
      ),
    }), {
      partCount: 0,
      palletCount: [],
      packetValidCount: [],
      packet_id: latest?.packet_id ?? null,
      signalStregnth: this.getFirstValue(latest, ['signalStregnth', 'signalStrength']) ?? null,
      RTT: latest?.RTT ?? null,
      gatewayUptimer: latest?.gatewayUptimer ?? null,
    });
  }

  /**
   * Dashboard bundle for MachineAnalyticsScreen.
   * Devices are scoped by logged-in custId, production stages are matched through
   * machineAssignments for those devices, and chart data is read from IoT raw collections.
   */
  async getMachineAnalyticsDashboard(date?: string, startTime?: string, endTime?: string, machineId?: string): Promise<any> {
    const custId = tenantContext.getStore();
    if (!custId) throw new BadRequestException('Tenant/custId is required');

    const { start, end, startMs, endMs } = this.buildDateRange(date, startTime, endTime);
    const deviceQuery: any = { custId: String(custId) };
    if (machineId) deviceQuery.gatewayId = machineId;

    const [devices, shifts] = await Promise.all([
      this.deviceModel
        .find(deviceQuery)
        .setOptions({ bypassTenant: true })
        .sort({ gatewayName: 1, deviceName: 1 })
        .lean()
        .exec(),
      this.shiftModel.find().sort({ startTime: 1 }).lean().exec(),
    ]);

    const gatewayIds = devices.map((device: any) => String(device.gatewayId || '').trim()).filter(Boolean);
    if (!gatewayIds.length) {
      return { machines: [], shifts, hourData: [], statusData: [], partCount: this.buildCycleAggSummary([]), window: { start, end } };
    }

    const productionDate = date || start.toISOString().slice(0, 10);
    const stageQuery: any = {
      tenantId: String(custId),
      $or: [
        { machineId: { $in: gatewayIds } },
        { 'machineAssignments.machineId': { $in: gatewayIds } },
        { 'machineAssignments.CustId': String(custId) },
        { 'machineAssignments.custId': String(custId) },
      ],
    };
    if (date) {
      stageQuery.$and = [{
        $or: [
          { productionDate },
          { 'machineAssignments.productionDate': productionDate },
          { createdAt: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } },
        ],
      }];
    }

    const stages = await this.stageModel
      .find(stageQuery)
      .setOptions({ bypassTenant: true })
      .populate('workOrderId')
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean()
      .exec();

    const activeStatuses = new Set([
      ProcessStageStatus.PENDING,
      ProcessStageStatus.IN_PROGRESS,
      ProcessStageStatus.QI_SUBMITTED,
      ProcessStageStatus.PDC_VERIFIED,
    ]);

    const machines = devices.map((device: any) => {
      const gatewayId = String(device.gatewayId || '');
      const matchedStages = stages.filter((stage: any) =>
        String(stage.machineId || '') === gatewayId || this.getAssignmentForMachine(stage, gatewayId)
      );
      const workOrders = matchedStages
        .map((stage: any) => this.toWorkOrderSummary(stage, this.getAssignmentForMachine(stage, gatewayId)))
        .filter((wo: any) => wo.id);
      const activeStage = matchedStages.find((stage: any) => activeStatuses.has(stage.status));
      const currentWorkOrder = activeStage
        ? this.toWorkOrderSummary(activeStage, this.getAssignmentForMachine(activeStage, gatewayId))
        : null;

      return {
        id: this.getDocId(device),
        _id: this.getDocId(device),
        machineId: gatewayId,
        name: device.gatewayName || device.deviceName || gatewayId,
        deviceName: device.deviceName,
        gatewayName: device.gatewayName,
        type: device.machineType || device.gatewayType || 'UNKNOWN',
        status: activeStage ? 'PROCESSING' : 'IDLE',
        producedCount: currentWorkOrder?.producedQty || 0,
        currentWorkOrder,
        workOrders,
        lastUpdated: device.updatedAt,
      };
    });

    const selectedGateways = machineId ? gatewayIds.filter(id => id === machineId) : gatewayIds;
    const iotDb = this.eqModel.collection.conn.db;
    if (!iotDb) throw new BadRequestException('IoT database connection is not ready');
    const appDb = this.appConnection.db;
    if (!appDb) throw new BadRequestException('Application database connection is not ready');
    const dateKeys = Array.from(new Set([start, end].map(value => value.toISOString().slice(0, 10))));

    const statusQuery = {
      $and: [
        {
          $or: [
            { gatewayID: { $in: selectedGateways } },
            { gatewayId: { $in: selectedGateways } },
            { machineId: { $in: selectedGateways } },
          ],
        },
        {
          $or: [
            { packet_id: { $gte: startMs, $lte: endMs } },
            { createdAt: { $gte: start, $lte: end } },
            { 'value.1': { $lte: endMs }, 'value.2': { $gte: startMs } },
            { overall_status: { $elemMatch: { 'value.1': { $lte: endMs }, 'value.2': { $gte: startMs } } } },
          ],
        },
      ],
    };

    const hourlyQuery = {
      $and: [
        {
          $or: [
            { gatewayId: { $in: selectedGateways } },
            { gatewayID: { $in: selectedGateways } },
            { machineId: { $in: selectedGateways } },
          ],
        },
        {
          $or: [
            { date: { $gte: start, $lte: end } },
            { date: { $in: dateKeys } },
            { sourceDate: { $in: dateKeys } },
            { hourRecordDate: { $in: dateKeys } },
            { startTimestamp: { $gte: start, $lte: end } },
            { packet_id: { $gte: startMs, $lte: endMs } },
            { segmentWindowStart: { $lte: endMs }, segmentWindowEnd: { $gte: startMs } },
            { cronWindowStart: { $lte: endMs }, cronWindowEnd: { $gte: startMs } },
          ],
        },
      ],
    };

    let [statusRecords, hourlyRecords] = await Promise.all([
      appDb.collection('equipmentagg_test')
        .find(statusQuery as any)
        .sort({ packet_id: 1 })
        .toArray(),
      appDb.collection('hourlyrecord')
        .find(hourlyQuery as any)
        .sort({ hourRecordDate: 1, segmentWindowStart: 1, hourNumber: 1, startTimestamp: 1 })
        .toArray(),
    ]);
    let cycleAggRecords = await appDb.collection('cycleagg')
      .find({
        $and: [
          {
            $or: [
              { gatewayID: { $in: selectedGateways } },
              { gatewayId: { $in: selectedGateways } },
              { machineId: { $in: selectedGateways } },
            ],
          },
          { packet_id: { $gte: startMs, $lte: endMs } },
        ],
      } as any)
      .sort({ packet_id: 1 })
      .toArray();

    let hourDataRecords: any[] = [];
    if (!statusRecords.length) {
      statusRecords = await iotDb.collection('equipmentagg_test')
        .find(statusQuery as any)
        .sort({ packet_id: 1 })
        .toArray();
    }

    if (!hourlyRecords.length) {
      hourlyRecords = await iotDb.collection('hourlyrecord')
        .find(hourlyQuery as any)
        .sort({ hourRecordDate: 1, segmentWindowStart: 1, hourNumber: 1, startTimestamp: 1 })
        .toArray();
    }

    if (!hourlyRecords.length) {
      hourDataRecords = await iotDb.collection('hourdata')
        .find({
          $and: [
            { $or: [{ gatewayId: { $in: selectedGateways } }, { gatewayID: { $in: selectedGateways } }] },
            {
              $or: [
                { date: { $gte: start, $lte: end } },
                { date: { $in: dateKeys } },
                { sourceDate: { $in: dateKeys } },
                { startTimestamp: { $gte: start, $lte: end } },
                { packet_id: { $gte: startMs, $lte: endMs } },
              ],
            },
          ],
        } as any)
        .sort({ hourNumber: 1, startTimestamp: 1 })
        .toArray();
    }
    if (!cycleAggRecords.length) {
      cycleAggRecords = await iotDb.collection('cycleagg')
        .find({
          $and: [
            {
              $or: [
                { gatewayID: { $in: selectedGateways } },
                { gatewayId: { $in: selectedGateways } },
                { machineId: { $in: selectedGateways } },
              ],
            },
            { packet_id: { $gte: startMs, $lte: endMs } },
          ],
        } as any)
        .sort({ packet_id: 1 })
        .toArray();
    }
    const statusData = this.flattenEquipmentStatus(statusRecords, startMs, endMs);
    const hourData = this.normalizeHourlyRecords(hourlyRecords.length ? hourlyRecords : hourDataRecords);
    const chart_data = this.buildStatusChartData(statusData);
    const partCount = this.buildCycleAggSummary(cycleAggRecords);

    return { machines, shifts, hourData, statusData, chart_data, partCount, window: { start, end } };
  }

  /**
   * Return hourly part production data for a single gateway on a given date.
   * Date is expected as "YYYY-MM-DD" — we query the full 24h window in UTC.
   */
  async getHourData(gatewayId: string, date: string, startTime?: string, endTime?: string): Promise<HourData[]> {
    const start = startTime ? new Date(startTime) : new Date(`${date}T00:00:00.000Z`);
    const end = endTime ? new Date(endTime) : new Date(`${date}T23:59:59.999Z`);
    return this.hourModel
      .find({
        gatewayId: gatewayId,
        date: { $gte: start, $lte: end },
      })
      .setOptions({ bypassTenant: true })
      .sort({ hourNumber: 1 })
      .lean()
      .exec();
  }

  /**
   * Return all equipment-status segments for a gateway on a given date.
   * packet_id is the primary timestamp (epoch milliseconds).
   */
  async getEquipmentStatus(gatewayId: string, date: string, startTime?: string, endTime?: string): Promise<EquipmentAgg[]> {
    const start = startTime ? new Date(startTime).getTime() : new Date(`${date}T00:00:00.000Z`).getTime();
    const end = endTime ? new Date(endTime).getTime() : new Date(`${date}T23:59:59.999Z`).getTime();
    return this.eqModel
      .find({
        gatewayID: gatewayId,
        packet_id: { $gte: start, $lte: end },
      })
      .setOptions({ bypassTenant: true })
      .sort({ packet_id: 1 })
      .lean()
      .exec();
  }

  /**
   * Return distinct gatewayIds that have data in hourdata.
   */
  async getAvailableGateways(): Promise<string[]> {
    return this.hourModel.distinct('gatewayId').setOptions({ bypassTenant: true }).exec();
  }

  // Device CRUD
  async getDevices(): Promise<Device[]> {
    return this.deviceModel.find().sort({ createdAt: -1 }).exec();
  }
  async createDevice(data: any): Promise<Device> {
    const existing = await this.deviceModel.findOne({ gatewayId: data.gatewayId }).setOptions({ bypassTenant: true }).exec();
    if (existing) throw new BadRequestException(`Device with Gateway ID ${data.gatewayId} is already registered.`);
    return new this.deviceModel(data).save();
  }
  async updateDevice(id: string, data: any): Promise<Device> {
    const doc = await this.deviceModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('Device not found');
    return doc;
  }
  async deleteDevice(id: string): Promise<boolean> {
    const result = await this.deviceModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async publishGatewayCommand(id: string, cmd: string): Promise<any> {
    const normalizedCmd = String(cmd || '').trim().toUpperCase();
    const commandCode = Number.isInteger(Number(normalizedCmd))
      ? Number(normalizedCmd)
      : this.gatewayControlCommands.get(normalizedCmd);

    if (!commandCode || commandCode < 1 || commandCode > 7) {
      throw new BadRequestException('Invalid gateway command');
    }

    const device = await this.deviceModel.findById(id).setOptions({ bypassTenant: true }).exec();
    if (!device) throw new NotFoundException('Device not found');

    const custId = String(device.custId || '').trim();
    const plantId = String(device.plantId || '').trim();
    const gatewayId = String(device.gatewayId || '').trim();
    if (!custId || !plantId || !gatewayId) {
      throw new BadRequestException('Device custId, plantId, and gatewayId are required to publish command');
    }

    const topic = `K2/V1.0/${custId}/${plantId}/${gatewayId}/gwCmd`;
    const payload = { gwControl: { cmd: commandCode } };
    const rejectUnauthorized = String(process.env.MQTT_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';
    const client = mqtt.connect(process.env.MQTT_URL || 'mqtts://13.126.221.45:8883', {
      username: process.env.MQTT_USERNAME || 'mqtt-test',
      password: process.env.MQTT_PASSWORD || 'mqtt-test',
      clientId: `gk-api-${gatewayId}-${Date.now()}`,
      reconnectPeriod: 0,
      connectTimeout: 10000,
      rejectUnauthorized,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.end(true);
          reject(new BadRequestException('MQTT publish timed out'));
        }, 15000);

        client.once('error', (err) => {
          clearTimeout(timeout);
          client.end(true);
          reject(err);
        });

        client.once('connect', () => {
          client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
            clearTimeout(timeout);
            client.end(false);
            if (err) reject(err);
            else resolve();
          });
        });
      });
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'Failed to publish MQTT command');
    }

    return { success: true, topic, payload };
  }

  // OTA Config CRUD
  async getOTAConfigs(): Promise<OTAConfig[]> {
    return this.otaModel.find().sort({ createdAt: -1 }).exec();
  }
  async getOTAConfigById(id: string): Promise<OTAConfig> {
    const doc = await this.otaModel.findById(id).exec();
    if (!doc) throw new NotFoundException('OTA Config not found');
    return doc;
  }
  async createOTAConfig(data: any): Promise<OTAConfig> {
    return new this.otaModel(data).save();
  }
  async updateOTAConfig(id: string, data: any): Promise<OTAConfig> {
    const doc = await this.otaModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('OTA Config not found');
    return doc;
  }
  async deleteOTAConfig(id: string): Promise<boolean> {
    const result = await this.otaModel.findByIdAndDelete(id).exec();
    return !!result;
  }
  async uploadOTAFile(file: Express.Multer.File, data: { fileName: string; version: string; tenantId?: string }): Promise<OTAConfig> {
    const tenantId = data.tenantId || 'default';
    const fileUrl = `/uploads/ota/${tenantId}/${file.filename}`;
    const existing = await this.otaModel.findOne({ fileName: data.fileName, version: data.version }).exec();
    if (existing) {
      const updated = await this.otaModel.findByIdAndUpdate(existing._id, { fileUrl, fileSize: file.size }, { new: true }).exec();
      if (!updated) throw new NotFoundException('OTA Config not found after update');
      return updated;
    }
    return new this.otaModel({ fileName: data.fileName, version: data.version, fileUrl, fileSize: file.size, tenantId }).save();
  }

  private async findLatestOTAByTenant(tenantId: string): Promise<OTAConfig | null> {
    const query = { tenantId };
    const sort = { createdAt: -1 as const };
    const defaultOTA = await this.otaModel
      .findOne(query)
      .setOptions({ bypassTenant: true })
      .sort(sort)
      .exec();
    if (defaultOTA) return defaultOTA;

    return this.iotOtaModel
      .findOne(query)
      .setOptions({ bypassTenant: true })
      .sort(sort)
      .exec();
  }

  // DeviceGateway CRUD
  async getDeviceGateways(): Promise<DeviceGateway[]> {
    return this.gatewayModel.find().sort({ createdAt: -1 }).exec();
  }
  async createDeviceGateway(data: any): Promise<DeviceGateway> {
    const existing = await this.gatewayModel.findOne({ gatewayId: data.gatewayId }).setOptions({ bypassTenant: true }).exec();
    if (existing) throw new BadRequestException(`Gateway with ID ${data.gatewayId} already exists.`);
    return new this.gatewayModel(data).save();
  }
  async updateDeviceGateway(id: string, data: any): Promise<DeviceGateway> {
    const doc = await this.gatewayModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!doc) throw new NotFoundException('DeviceGateway not found');
    return doc;
  }
  async deleteDeviceGateway(id: string): Promise<boolean> {
    const result = await this.gatewayModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  // Custom specialized APIs for CellAI devices
  async getDeviceConfigInfo(gatewayId: string, authToken?: string): Promise<any> {
    const device = await this.deviceModel.findOne({ gatewayId }).setOptions({ bypassTenant: true }).exec();
    if (!device) throw new NotFoundException('Device configuration not found');
    const token = this.extractBearerToken(authToken);
    if (!token || token !== device.parentKey) throw new UnauthorizedException('Invalid Authorization token');

    const lastOTA = await this.otaModel
      .findOne({ tenantId: device.custId })
      .setOptions({ bypassTenant: true })
      .sort({ createdAt: -1 })
      .exec();

    return {
      tenantID: `${device.tenantId || 'DEFAULT'}/${gatewayId}`,
      authToken: device.parentKey || 'hCQuewOTsvOjQcKovfYTs2M1evhGgdAs',
      lastGatewayMasterConfigUpdateDate: new Date(device.updatedAt).getTime(),
      lastOTAFileUpdate: lastOTA ? new Date(lastOTA.createdAt).getTime() : 0,
      expiry: 1747890829000, // Dummy as per doc
    };
  }

  async getMasterDeviceConfig(gatewayId: string, authToken?: string): Promise<any> {
    const device = await this.deviceModel.findOne({ gatewayId }).setOptions({ bypassTenant: true }).exec();
    if (!device) throw new NotFoundException('Device not found');
    const token = this.extractBearerToken(authToken);
    if (!token || token !== device.parentKey) throw new UnauthorizedException('Invalid Authorization token');

    const lastOTA = await this.otaModel
      .findOne({ tenantId: device.custId })
      .setOptions({ bypassTenant: true })
      .sort({ createdAt: -1 })
      .exec();

    return {
      tenantID: `${device.tenantId || 'DEFAULT'}/${gatewayId}`,
      "v1.0": {
        ota: {
          url: lastOTA?.fileUrl || '',
          key: device.parentKey || "D6RHM72D6RHM72D6RHM72D6RHM72D6RHM72",
          fileName: lastOTA?.fileName || '',
          lastOTAFileUpdate: lastOTA ? new Date(lastOTA.createdAt).getTime() : 0,
        },
        connectivity: {
          clientID: gatewayId,
          mqttUrl: "mqtts://13.126.221.45:8883",
          userName: "mqtt-test",
          password: "mqtt-test",
        },
        avbFactor: device.avbFactor,
        pefomanceFactor: device.performanceFactor,
        INPin: device.INPin,
        eMICConfig: device.eMICConfig,
      }
    };
  }

  async getDeviceDataFormat(gatewayId: string, serverBase: string, authToken?: string): Promise<any> {
    const device = await this.deviceModel.findOne({ gatewayId }).setOptions({ bypassTenant: true }).exec();
    if (!device) throw new NotFoundException('Device not found');
    const token = this.extractBearerToken(authToken);
    if (!token || token !== device.parentKey) throw new UnauthorizedException('Invalid Authorization token');

    const lastOTA = await this.otaModel.findOne({ tenantId: device.custId }).sort({ updatedAt: -1 }).exec();
    const externalOTA = await this.getExternalOTAVersion();
    serverBase = serverBase.replace(/\/$/, '').replace(/^http:/, 'https:');
    const certServerBase = 'https://gkengineering.wimerasys.in/testapi';
    const custId = device.custId;
    const plantId = device.plantId;
    const topicBase = `K10/V1.0/${custId}/${plantId}/${gatewayId}`;

    return {
      tenantID: `${custId}-${plantId}-${gatewayId}`,
      'v1.0': {
        ota: {
          url: externalOTA?.url || (lastOTA ? `${serverBase}/iot${lastOTA.fileUrl.split('/').map(encodeURIComponent).join('/')}` : ''),
          // key: device.parentKey || 'D6RHM72D6RHM72D6RHM72D6RHM72D6RHM72',
          // fileName: externalOTA?.fileName || (lastOTA ? lastOTA.fileUrl.split('/').pop() || '' : ''),
          lastOTAFileUpdate: externalOTA?.lastOTAFileUpdate || (lastOTA ? new Date(lastOTA.createdAt).getTime() : 0),
        },
        connectivity: {
          clientID: gatewayId,
          mqttUrl: 'mqtts://13.126.221.45:8883',
          userName: 'mqtt-test',
          password: 'mqtt-test',
          willTopic: `${topicBase}/gwState`,
          subTopic: `${topicBase}/gwCmd`,
          gwInfoTopic: `${topicBase}/gwInfo`,
          gwStateTopic: `${topicBase}/equipmentState`,
          gwCycleTopic: `${topicBase}/cycleAnlysis`,
          gwInterlockTopic: `${topicBase}/intelockTrace`,
          gwDITopic: `${topicBase}/gwDigiUpdate`,
          modTopic: `${topicBase}/gwModUpdate`,
          ssl_tls: 1,
          sslSecureFlag: 0,
          enableServerCertAuth: 1,
          privateKeyPassword: null,
          caRootPath: `${certServerBase}/certs/rootCA.pem`,
          clientCRTPath: `${certServerBase}/certs/server.crt`,
          privateKeyPath: `${certServerBase}/certs/server.key`,
        },
        avbFactor: {
          postTime: device.avbFactor?.postTime ?? 10,
          algorithm: device.avbFactor?.algorithm ?? 1,
          dutyCyc: device.avbFactor?.dutyCyc ?? 60,
          runDur: device.avbFactor?.runDur ?? 60,
          interlock: device.avbFactor?.interlock ?? 1,
          dep: device.avbFactor?.dep ?? [],
        },
        performanceFactor: {
          enabled: device.performanceFactor?.enabled ?? 0,
          postTime: device.performanceFactor?.postTime ?? 30,
          algorithm: device.performanceFactor?.algorithm ?? 1,
          debounceTime: device.performanceFactor?.debounceTime ?? 0,
          dep: device.performanceFactor?.dep ?? [],
        },
        INPin: {
          enabled: device.INPin?.enabled ?? 1,
          scanTime: device.INPin?.scanTime ?? 10,
          postTime: device.INPin?.postTime ?? 10,
        },
        eMICConfig: {
          enabled: device.eMICConfig?.enabled ?? 1,
          postTime: device.eMICConfig?.postTime ?? 10,
          Freq: device.eMICConfig?.freq ?? 0,
          phaseSeq: device.eMICConfig?.phaseSeq ?? 1,
          cngfFactor: device.eMICConfig?.cngfFactor ?? [],
        },
      },
    };
  }

  async validateAuthToken(authToken?: string): Promise<void> {
    const token = this.extractBearerToken(authToken);
    if (!token) throw new UnauthorizedException('Authorization token is required');
    const device = await this.deviceModel.findOne({ parentKey: token }).setOptions({ bypassTenant: true }).exec();
    if (!device) throw new UnauthorizedException('Invalid Authorization token');
  }

  private extractBearerToken(authToken?: string): string {
    const raw = String(authToken || '').trim();
    if (!raw) return '';
    const bearerMatch = raw.match(/^Bearer\s+(.+)$/i);
    return bearerMatch ? bearerMatch[1].trim() : '';
  }

  private async getExternalOTAVersion(): Promise<{ url: string; fileName: string; lastOTAFileUpdate: number } | null> {
    const otaVersionUrl = 'https://k2dev.azurewebsites.net/api/k2V1/getOTAVersion';
    const otaProject = 'Edj10_V1.0';
    const otaFunctionKey = process.env.AZURE_OTA_FUNCTION_KEY;

    try {
      if (!otaFunctionKey) {
        console.warn('AZURE_OTA_FUNCTION_KEY is not configured; skipping external OTA version check');
        return null;
      }

      const requestUrl = new URL(otaVersionUrl);
      requestUrl.searchParams.set('project', otaProject);
      const response = await fetch(requestUrl.toString(), {
        method: 'GET',
        headers: { 'x-functions-key': otaFunctionKey },
      });

      if (!response.ok) return null;
      const data = await response.json();
      const config = Array.isArray(data?.config) ? data.config[0] : null;
      if (!config?.url) return null;

      const fileUrl = new URL(String(config.url));
      return {
        url: String(config.url),
        fileName: fileUrl.pathname.split('/').pop() || '',
        lastOTAFileUpdate: config.lastModify ? new Date(config.lastModify).getTime() : 0,
      };
    } catch {
      return null;
    }
  }

  async getDeviceUpdateConfigInfo(custId: string, plantId: string, gatewayId: string, authToken?: string): Promise<any> {
    const device = await this.deviceModel
      .findOne({ custId, plantId, gatewayId })
      .setOptions({ bypassTenant: true })
      .exec();
    if (!device) throw new NotFoundException('Device not found');
    const token = this.extractBearerToken(authToken);
    if (!token || token !== device.parentKey) throw new UnauthorizedException('Invalid Authorization token');

    const lastOTA = await this.findLatestOTAByTenant(custId);

    const createdAt = new Date(device.createdAt);
    let expiry = new Date(createdAt);
    const licensing = (device.licensing || '').toLowerCase();
    if (licensing.includes('1 year')) {
      expiry.setFullYear(expiry.getFullYear() + 1);
    } else if (licensing.includes('6 month')) {
      expiry.setMonth(expiry.getMonth() + 6);
    } else if (licensing.includes('3 month')) {
      expiry.setMonth(expiry.getMonth() + 3);
    } else if (licensing.includes('1 month')) {
      expiry.setMonth(expiry.getMonth() + 1);
    } else {
      expiry.setFullYear(expiry.getFullYear() + 1); // default 1 year
    }

    return {
      tenantID: `${custId}-${plantId}-${gatewayId}`,
      authToken: device.parentKey || '',
      lastGatewayMasterConfigUpdateDate: new Date(device.updatedAt).getTime(),
      // lastOTAFileUpdate: lastOTA ? new Date(lastOTA.createdAt).getTime() : 0,
      expiry: expiry.getTime(),
    };
  }
}
