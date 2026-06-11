import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RawMaterial } from './schemas/raw-material.schema';
import { InventoryStock } from './schemas/inventory-stock.schema';
import { PartInventory } from './schemas/part-inventory.schema';
import { MonthlySchedule } from './schemas/monthly-schedule.schema';
import { WorkOrder } from '../work-order/schemas/work-order.schema';
import { ProcessStage } from '../production/schemas/process-stage.schema';
import * as XLSX from 'xlsx';
@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(RawMaterial.name) private rawMaterialModel: Model<RawMaterial>,
    @InjectModel(InventoryStock.name) private stockModel: Model<InventoryStock>,
    @InjectModel(MonthlySchedule.name) private scheduleModel: Model<MonthlySchedule>,
    @InjectModel(WorkOrder.name) private workOrderModel: Model<WorkOrder>,
    @InjectModel(ProcessStage.name) private stageModel: Model<ProcessStage>,
    @InjectModel(PartInventory.name) private partInventoryModel: Model<PartInventory>,
  ) { }

  /**
   * Normalises date strings that arrive in DD-MM-YYYY or DD/MM/YYYY format
   * (as typed by the user in the Indian locale) to ISO YYYY-MM-DD so that
   * Mongoose's Date type can parse them without error.
   */
  private normaliseDateField(value: any): string | undefined {
    if (!value) return undefined;

    // If it's already a Date object, return it as ISO string
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    // If it's not a string (e.g. Excel number), return it as-is
    if (typeof value !== 'string') return value;

    // Match DD-MM-YYYY or DD/MM/YYYY
    const match = value.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`; // → YYYY-MM-DD
    }
    return value; // already ISO or some other format — leave as-is
  }

  async createRawMaterial(data: any): Promise<RawMaterial> {
    try {
      // Normalise date fields before Mongoose validation
      const normalised = {
        ...data,
        dateReceived: this.normaliseDateField(data.dateReceived),
      };
      console.log('Creating RawMaterial with data:', JSON.stringify(normalised, null, 2));
      const rm = new this.rawMaterialModel(normalised);
      return await rm.save();
    } catch (e) {
      console.error('[InventoryService] createRawMaterial Error:', e.message);
      throw e;
    }
  }

  async deleteRawMaterial(id: string): Promise<boolean> {
    const result = await this.rawMaterialModel.findByIdAndDelete(id).exec();
    if (result) {
      await this.rebuildAllStock(result.tenantId || 'SYSTEM');
    }
    return !!result;
  }

  async getRawMaterials(): Promise<RawMaterial[]> {
    return this.rawMaterialModel.find().sort({ createdAt: -1 }).exec();
  }

  async updateRawMaterial(id: string, data: any): Promise<RawMaterial | null> {
    const { _id, __v, ...rawFields } = data; // strip immutable fields
    // Normalise date field the same way as create
    const updateFields = {
      ...rawFields,
      ...(rawFields.dateReceived ? { dateReceived: this.normaliseDateField(rawFields.dateReceived) } : {}),
    };
    console.log(`[InventoryService] Updating ${id} with status=${updateFields.status}`);

    const oldDoc = await this.rawMaterialModel.findById(id).exec();
    const updated = await this.rawMaterialModel.findByIdAndUpdate(id, { $set: updateFields }, { new: true }).exec();

    if (updated && (oldDoc?.status !== updated.status || oldDoc?.receivedQuantity !== updated.receivedQuantity)) {
      console.log(`[InventoryService] Status/Quantity changed, syncing stock for grade: ${updated.grade}`);
      await this.syncStockForGrade(updated.grade, updated.tenantId!);
    }

    return updated;
  }

  async syncStockForGrade(grade: string, tenantId: string) {
    console.log(`[InventoryService] --- DEEP SYNC START for Grade: ${grade} ---`);
    console.log(`[InventoryService] Active Tenant (Context): ${tenantId}`);

    // Diagnostic: Count all raw materials for this grade regardless of status or tenant (if possible via native)
    const allForGrade = await this.rawMaterialModel.collection.countDocuments({ grade, tenantId });
    const allApproved = await this.rawMaterialModel.collection.countDocuments({ grade, status: 'APPROVED', tenantId });
    const allApprovedThisTenant = await this.rawMaterialModel.collection.countDocuments({ grade, status: 'APPROVED', tenantId });

    console.log(`[InventoryService] DB Stats (Raw Collection):`);
    console.log(`  - Total for Grade ${grade}: ${allForGrade}`);
    console.log(`  - Total APPROVED for Grade ${grade}: ${allApproved}`);
    console.log(`  - Total APPROVED for Grade ${grade} & Tenant ${tenantId}: ${allApprovedThisTenant}`);

    // 1. Sum approved receipts
    const receipts = await this.rawMaterialModel.find({ 
      grade, 
      status: { $in: ['APPROVED', 'PARTIAL_REJECT'] }, 
      tenantId 
    }).exec();
    const totalReceived = receipts.reduce((acc, r) => acc + (r.receivedQuantity - (r.rejectedQuantity || 0)), 0);

    // 2. Sum actual usage from all batches (This is the most accurate source of truth for deduction)
    const totalUsed = receipts.reduce((acc, r) => acc + (r.usedQuantity || 0), 0);

    console.log(`[InventoryService] syncStockForGrade [${grade}]: Received=${totalReceived}kg, Used=${totalUsed}kg`);

    const available = totalReceived - totalUsed;

    await this.stockModel.findOneAndUpdate(
      { grade, tenantId },
      {
        totalReceivedKg: totalReceived,
        totalUsedKg: totalUsed,
        availableStockKg: available
      },
      { upsert: true, new: true }
    ).exec();

    console.log(`[InventoryService] --- DEEP SYNC END: Available=${available}kg ---`);
    return { grade, totalReceived, totalUsed, available };
  }

  /**
   * Explicitly deducts material from batches (FIFO) and updates macro stock.
   * Called when a Work Order status transitions to IN_PROGRESS.
   */
  async deductMaterialForWorkOrder(workOrderId: string) {
    console.log(`[InventoryService] >>> STARTING DEDUCTION for WO: ${workOrderId} <<<`);
    
    // Bypass tenant filter to ensure we can find the WO regardless of request context
    const wo = await this.workOrderModel.findById(workOrderId).setOptions({ bypassTenant: true }).exec();
    if (!wo) {
      console.error(`[InventoryService] ERROR: Work Order ${workOrderId} NOT FOUND (even with bypass).`);
      return;
    }

    console.log(`[InventoryService] Found WO: Status=${wo.status}, Tenant=${wo.tenantId}, MasterID="${wo.masterId}"`);

    if ((wo as any).isMaterialDeducted) {
      console.log(`[InventoryService] SKIPPING: Material already deducted for WO ${workOrderId}.`);
      return;
    }

    // NEW: Double-deduction safeguard
    // If this is a child WO and the parent already deducted, skip.
    if (wo.parentWorkOrderId) {
      const parent = await this.workOrderModel.findById(wo.parentWorkOrderId).exec();
      if (parent && (parent as any).isMaterialDeducted) {
        console.log(`[InventoryService] Parent WO ${wo.parentWorkOrderId} already deducted. Skipping raw stock deduction for child ${workOrderId}.`);
        (wo as any).isMaterialDeducted = true;
        await (wo as any).save();
        return;
      }
    }

    // If this is a parent WO and any children already deducted, mark as deducted but be careful.
    // Actually, usually it's better to just mark the flag.

    // Use trimmed Master ID for search
    const masterId = (wo.masterId || '').trim();
    let grade = wo.materialGrade;
    const totalKg = (wo.requiredQuantityKg || 0) + (wo.bufferKg || 0);
    const tenantId = wo.tenantId || 'SYSTEM';

    if (totalKg <= 0) {
      console.log(`[InventoryService] SKIPPING: totalKg is ${totalKg}.`);
      return;
    }
    if (!masterId) {
      console.log(`[InventoryService] SKIPPING: masterId is empty.`);
      return;
    }

    console.log(`[InventoryService] Target: Deduct ${totalKg}kg of MasterID "${masterId}" (Tenant: ${tenantId})`);

    // 1. Find batches for this Master ID (materialId) - Case-insensitive match
    // IMPORTANT: Bypass tenant filter here too, but filter manually by the WO's tenantId
    const batches = await this.rawMaterialModel.find({
      materialId: { $regex: new RegExp(`^${masterId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
      status: { $in: ['APPROVED', 'PARTIAL_REJECT'] },
      tenantId
    }).setOptions({ bypassTenant: true }).sort({ createdAt: 1 }).exec();

    console.log(`[InventoryService] Found ${batches.length} APPROVED batches for MasterID: "${masterId}" (case-insensitive) and Tenant: ${tenantId}`);

    // If grade was missing on WO, try to get it from the first batch
    if (!grade && batches.length > 0) {
      grade = batches[0].grade;
      console.log(`[InventoryService] Resolved missing grade from batch: ${grade}`);
      wo.materialGrade = grade;
      await wo.save();
    }

    if (!grade && batches.length === 0) {
      console.log(`[InventoryService] SKIPPING: No batches found for "${masterId}" and no grade available.`);
      return;
    }

    // 2. Batch-level deduction (FIFO)
    let remainingToDeduct = totalKg;
    const affectedGrades = new Set<string>();
    if (grade) affectedGrades.add(grade);

    for (const batch of batches) {
      if (remainingToDeduct <= 0) {
        console.log(`[InventoryService] Deduction goal reached.`);
        break;
      }
      
      const availableInBatch = (batch.receivedQuantity - (batch.rejectedQuantity || 0) - (batch.usedQuantity || 0));
      console.log(`[InventoryService] Batch ${batch.batchNumber}: Avail=${availableInBatch}kg`);
      
      if (availableInBatch > 0) {
        const deduction = Math.min(availableInBatch, remainingToDeduct);
        batch.usedQuantity = (batch.usedQuantity || 0) + deduction;
        
        if (!batch.consumptionLog) batch.consumptionLog = [];
        batch.consumptionLog.push({
          workOrderId: workOrderId,
          quantity: deduction,
          timestamp: new Date()
        });

        if (batch.grade) affectedGrades.add(batch.grade);
        
        await batch.save();
        remainingToDeduct -= deduction;
        console.log(`[InventoryService] >>> SUCCESS: Deducted ${deduction}kg from Batch ${batch.batchNumber || batch.materialId}. Remaining: ${remainingToDeduct}kg`);
      }
    }

    if (remainingToDeduct > 0) {
      console.warn(`[InventoryService] CRITICAL WARNING: Only partially deducted. ${remainingToDeduct}kg still remaining.`);
    }

    // 3. Macro stock sync for all affected grades
    console.log(`[InventoryService] Syncing stock for grades: ${Array.from(affectedGrades).join(', ')}`);
    for (const g of affectedGrades) {
      await this.syncStockForGrade(g, tenantId);
    }

    // 4. Mark as deducted
    (wo as any).isMaterialDeducted = true;
    await (wo as any).save();

    console.log(`[InventoryService] <<< DEDUCTION FINISHED <<<`);
  }


  /**
   * Returns material to batches (LIFO) and updates macro stock.
   * Used for returning scrap weight and rejected parts weight to inventory.
   */
  async returnMaterialToStock(materialId: string, grade: string, quantityKg: number, tenantId: string) {
    if (quantityKg <= 0 || !materialId || !grade) return;

    console.log(`[InventoryService] Returning ${quantityKg}kg of ${grade} (MasterID: ${materialId}) to stock for Tenant: ${tenantId}`);

    // 1. Return to batches (LIFO - most recently used batches first)
    const batches = await this.rawMaterialModel.find({
      materialId: { $regex: new RegExp(`^${materialId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
      status: { $in: ['APPROVED', 'PARTIAL_REJECT'] },
      tenantId
    }).setOptions({ bypassTenant: true }).sort({ createdAt: -1 }).exec();

    let toReturn = quantityKg;
    for (const batch of batches) {
      if (toReturn <= 0) break;
      const currentlyUsed = batch.usedQuantity || 0;
      const canReturn = Math.min(currentlyUsed, toReturn);
      if (canReturn > 0) {
        batch.usedQuantity = currentlyUsed - canReturn;
        
        // Log the return
        if (!batch.consumptionLog) batch.consumptionLog = [];
        batch.consumptionLog.push({
          workOrderId: `RETURN-${materialId}`,
          quantity: -canReturn, // Negative indicates return
          timestamp: new Date()
        });

        await batch.save();
        toReturn -= canReturn;
        console.log(`[InventoryService] Returned ${canReturn}kg to batch ${batch.batchNumber}`);
      }
    }

    if (toReturn > 0) {
      console.warn(`[InventoryService] Could only return ${quantityKg - toReturn}kg. ${toReturn}kg could not be returned to batches (no used quantity found).`);
    }

    // 2. Sync macro stock
    await this.syncStockForGrade(grade, tenantId);
  }


  async rebuildAllStock(tenantId: string) {
    // Distinct grades for THIS tenant
    const grades = await this.rawMaterialModel.distinct('grade', { tenantId }).exec();
    const results = [];
    for (const grade of grades) {
      if (grade) {
        results.push(await this.syncStockForGrade(grade, tenantId));
      }
    }
    return results;
  }

  async createMonthlySchedule(data: any): Promise<MonthlySchedule> {
    const schedule = new this.scheduleModel(data);
    return schedule.save();
  }

  async deleteMonthlySchedule(id: string): Promise<boolean> {
    const result = await this.scheduleModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  async updateMonthlySchedule(id: string, data: any): Promise<MonthlySchedule | null> {
    const { _id, __v, ...updateFields } = data;
    return this.scheduleModel.findByIdAndUpdate(id, { $set: updateFields }, { new: true }).exec();
  }

  async getMonthlySchedules(): Promise<MonthlySchedule[]> {
    return this.scheduleModel.find().sort({ date: -1 }).exec();
  }

  async getDistinctBatches(): Promise<string[]> {
    return this.rawMaterialModel.distinct('materialId', { status: 'APPROVED' }).exec();
  }

  async getDistinctGrades(): Promise<string[]> {
    return this.rawMaterialModel.distinct('grade', { status: 'APPROVED' }).exec();
  }


  async getBatchDetails(materialId: string) {
    const allMaterials = await this.rawMaterialModel.find({ materialId }).exec();
    if (allMaterials.length === 0) return null;

    const approvedMaterials = allMaterials.filter(m => m.status === 'APPROVED');
    const pendingMaterials = allMaterials.filter(m => m.status === 'PENDING');

    const grades = Array.from(new Set(allMaterials.map(m => m.grade)));
    
    const approvedQty = approvedMaterials.reduce((acc, curr) => acc + (curr.receivedQuantity - (curr.rejectedQuantity || 0) - (curr.usedQuantity || 0)), 0);
    const pendingQty = pendingMaterials.reduce((acc, curr) => acc + (curr.receivedQuantity - (curr.rejectedQuantity || 0)), 0);

    return {
      materialId,
      grades,
      materialGrade: allMaterials[0]?.grade || '',
      availableStockKg: Math.max(0, approvedQty),
      totalAvailableKg: Math.max(0, approvedQty + pendingQty),
      pendingStockKg: Math.max(0, pendingQty),
      isApproved: approvedMaterials.length > 0
    };
  }

  async getGradeDetails(grade: string, tenantId: string) {
    const materials = await this.rawMaterialModel.find({ grade, status: 'APPROVED', tenantId }).exec();
    const totalQty = materials.reduce((acc, curr) => acc + (curr.receivedQuantity - (curr.rejectedQuantity || 0) - (curr.usedQuantity || 0)), 0);
    const batches = Array.from(new Set(materials.map(m => m.materialId)));

    return {
      grade,
      availableStockKg: Math.max(0, totalQty),
      batches
    };
  }


  async bulkUploadRawMaterials(fileBuffer: Buffer, tenantId: string, userId: string = 'SYSTEM') {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const findField = (row: any, field: string) => {
      const keys = Object.keys(row);
      const cleaned = field.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleaned);
      return match ? row[match] : null;
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const requiredFields = ['materialId', 'grade', 'receivedQuantity', 'batchNumber', 'weightPerComponentKg', 'numberOfComponents'];
    let importedCount = 0;
    let skippedCount = 0;

    for (const row of data as any[]) {
      const processedRow: any = {};
      for (const field of requiredFields) {
        const val = findField(row, field);
        if (val === null || val === undefined) throw new Error(`Missing mandatory field: ${field}`);
        processedRow[field] = val;
      }

      const rawDate = findField(row, 'dateReceived');
      const dateReceived = (rawDate && !isNaN(new Date(rawDate).getTime())) ? new Date(rawDate) : new Date();

      if (dateReceived < todayStart) {
        skippedCount++;
        continue;
      }

      await this.createRawMaterial({
        ...processedRow,
        tenantId,
        dateReceived,
        receivedById: userId,
        status: 'PENDING'
      });
      importedCount++;
    }
    return {
      count: importedCount,
      skipped: skippedCount,
      message: skippedCount > 0
        ? `Imported ${importedCount} record(s). ${skippedCount} row(s) skipped — past dates are not allowed.`
        : `Successfully imported ${importedCount} record(s).`
    };
  }

  async bulkUploadSchedules(fileBuffer: Buffer, tenantId: string) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const findField = (row: any, field: string) => {
      const keys = Object.keys(row);
      const cleaned = field.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleaned);
      return match ? row[match] : null;
    };

    const requiredFields = ['serialNumber', 'partId', 'partName', 'requiredQuantity', 'date'];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let importedCount = 0;
    let skippedCount = 0;

    for (const row of data as any[]) {
      const processedRow: any = {};
      for (const field of requiredFields) {
        const val = findField(row, field);
        if (val === null || val === undefined) throw new Error(`Missing mandatory field: ${field}`);
        processedRow[field] = val;
      }

      const rawDate = processedRow.date;
      const date = (rawDate && !isNaN(new Date(rawDate).getTime())) ? new Date(rawDate) : new Date();

      if (date < todayStart) {
        skippedCount++;
        continue;
      }

      await this.createMonthlySchedule({
        ...processedRow,
        tenantId,
        date
      });
      importedCount++;
    }
    return {
      count: importedCount,
      skipped: skippedCount,
      message: skippedCount > 0
        ? `Imported ${importedCount} record(s). ${skippedCount} row(s) skipped — past dates are not allowed.`
        : `Successfully imported ${importedCount} record(s).`
    };
  }

  async getDashboardData() {
    const rawMaterials = await this.rawMaterialModel.find().exec();

    // Raw Material Stock Breakdown
    const approvedMaterials = rawMaterials.filter(m => m.status === 'APPROVED' || m.status === 'PARTIAL_REJECT');
    const totalReceivedKg = approvedMaterials.reduce((acc, m) => acc + (m.receivedQuantity - (m.rejectedQuantity || 0)), 0);
    const totalUsedKg = approvedMaterials.reduce((acc, m) => acc + (m.usedQuantity || 0), 0);
    const remainingKg = totalReceivedKg - totalUsedKg;

    // Legacy: kept for backward compatibility
    const totalMaterials = totalReceivedKg;

    const workOrders = await this.workOrderModel.find().exec();
    // Filter out SUB work orders from the main count to avoid double-counting top-level orders
    const topLevelWOs = workOrders.filter(wo => wo.type !== 'SUB');
    
    const totalWorkOrders = topLevelWOs.length;
    const activeWorkOrders = topLevelWOs.filter(wo => (wo.status || '').toUpperCase() === 'IN_PROGRESS').length;

    const stages = await this.stageModel.find().exec();
    const totalInspections = stages.filter(s => s.status !== 'PENDING' && s.status !== 'IN_PROGRESS').length;
    const totalScrap = stages.reduce((acc, curr) => acc + (curr.scrapWeightKg || 0), 0);

    // Quality Summary counts from completed stages
    // To avoid double-counting across the pipeline, we use specific stages for unit counts
    const completedStages = stages.filter(s => s.status !== 'PENDING' && s.status !== 'IN_PROGRESS');

    const totalProduced = completedStages
      .filter(s => s.type === 'DIE_CASTING')
      .reduce((acc, s) => acc + (s.inputQuantity || 0), 0);

    const totalGood = completedStages
      .filter(s => s.type === 'FINAL_QA')
      .reduce((acc, s) => acc + (s.goodPartsCount || 0), 0);

    const totalRework = completedStages.reduce((acc, s) => acc + (s.reworkPartsCount || 0), 0);
    const totalRejected = completedStages.reduce((acc, s) => acc + (s.rejectedPartsCount || 0), 0);

    return {
      totalRawMaterials: totalMaterials,
      totalReceivedKg,
      totalUsedKg,
      remainingKg,
      activeWorkOrders,
      totalScrap,
      totalWorkOrders,
      totalInspections,
      totalProduced,
      totalGood,
      totalRework,
      totalRejected,
    };
  }

  async updatePartInventory(data: {
    partId: string;
    shift: string;
    date: string;
    processType: string;
    goodCount: number;
    rejectionDetails: Array<{ reason: string; count: number }>;
    reworkDetails: Array<{ reason: string; count: number }>;
    tenantId?: string;
  }) {
    console.log(`[InventoryService] Updating PartInventory for ${data.partId} - ${data.shift} - ${data.date}`);
    return this.partInventoryModel.findOneAndUpdate(
      { partId: data.partId, shift: data.shift, date: data.date, processType: data.processType },
      { $set: data },
      { upsert: true, new: true }
    ).exec();
  }

  /**
   * Phase 3A+3B: Comprehensive WIP and Process-wise Stock Summary
   * Computes:
   *   - Raw Inventory (total approved KG)
   *   - WIP (all IN_PROGRESS WOs × their KG + buffer + excess)
   *   - Available Inventory = Raw Inventory - WIP
   *   - Per-process: Stock, Rework Stock, Rejected Stock, Scrap
   *   - Cross-process Balance: Die Cast → Coating → Machining
   */
  async calculateStockSummary(tenantId?: string) {
    const rawMaterials = await this.rawMaterialModel.find(tenantId ? { tenantId } : {}).exec();
    const approvedMats = rawMaterials.filter(m => m.status === 'APPROVED' || m.status === 'PARTIAL_REJECT');
    const totalReceivedKg = approvedMats.reduce((acc, m) => acc + (m.receivedQuantity - (m.rejectedQuantity || 0)), 0);
    const totalUsedKg = approvedMats.reduce((acc, m) => acc + (m.usedQuantity || 0), 0);
    const rawInventoryKg = totalReceivedKg; // gross received

    const workOrders = await this.workOrderModel.find(tenantId ? { tenantId } : {}).exec();
    const stages = await this.stageModel.find(tenantId ? { tenantId } : {}).exec();

    // ── WIP: all IN_PROGRESS work orders ──
    const inProgressWOs = workOrders.filter(wo => wo.status === 'IN_PROGRESS');
    let wipKg = 0;
    for (const wo of inProgressWOs) {
      const baseKg = (wo.targetPartCount || 0) * (wo.weightPerPart || 0);
      const bufferKg = wo.bufferKg || 0;

      // Find the Die Cast stage for this WO to get excessMaterialReceivedKg
      const dcStage = stages.find(s =>
        String(s.workOrderId?._id || s.workOrderId) === String(wo._id) &&
        s.type === 'DIE_CASTING'
      );
      const excessKg = dcStage ? (dcStage as any).excessMaterialReceivedKg || 0 : 0;

      wipKg += baseKg + bufferKg + excessKg;
    }

    const availableInventoryKg = Math.max(0, rawInventoryKg - totalUsedKg);

    // ── Per-process aggregation ──
    const processTypes = ['DIE_CASTING', 'COATING', 'MACHINING'];
    const processSummary: Record<string, {
      goodParts: number; goodKg: number;
      reworkParts: number; reworkKg: number;
      rejectedParts: number; rejectedKg: number;
      scrapKg: number;
    }> = {};

    for (const pt of processTypes) {
      const ptStages = stages.filter(s => s.type === pt);
      let goodParts = 0, reworkParts = 0, rejectedParts = 0, scrapKg = 0;

      for (const s of ptStages) {
        const wo = workOrders.find(w => String(w._id) === String(s.workOrderId?._id || s.workOrderId));
        const wpp = wo?.weightPerPart || 0;
        goodParts += s.goodPartsCount || 0;
        reworkParts += s.reworkPartsCount || 0;
        rejectedParts += s.rejectedPartsCount || 0;
        scrapKg += s.scrapWeightKg || 0;
      }

      // Use average weightPerPart across related WOs for KG calc
      const avgWpp = (() => {
        const wos = ptStages.map(s => workOrders.find(w => String(w._id) === String(s.workOrderId?._id || s.workOrderId)));
        const wpps = wos.filter(Boolean).map(w => w!.weightPerPart || 0).filter(v => v > 0);
        return wpps.length > 0 ? wpps.reduce((a, b) => a + b, 0) / wpps.length : 0;
      })();

      processSummary[pt] = {
        goodParts, goodKg: goodParts * avgWpp,
        reworkParts, reworkKg: reworkParts * avgWpp,
        rejectedParts, rejectedKg: rejectedParts * avgWpp,
        scrapKg
      };
    }

    // ── Cross-process balances ──
    const dieCastStock = processSummary['DIE_CASTING']?.goodKg || 0;
    const coatingStock = processSummary['COATING']?.goodKg || 0;
    const machiningStock = processSummary['MACHINING']?.goodKg || 0;

    return {
      rawInventoryKg,
      totalUsedKg,
      availableInventoryKg,
      wipKg,
      netInventoryKg: Math.max(0, availableInventoryKg - wipKg),
      processSummary,
      balances: {
        dieCastBalance: Math.max(0, dieCastStock - coatingStock),
        coatingBalance: Math.max(0, coatingStock - machiningStock),
      }
    };
  }

  // ── Inventory Ledger: dynamic per-process material flow ──
  async getLedgerData(tenantId?: string) {
    const filter = tenantId ? { tenantId } : {};
    const [rawMaterials, workOrders, stages] = await Promise.all([
      this.rawMaterialModel.find(filter).exec(),
      this.workOrderModel.find(filter).exec(),
      this.stageModel.find(filter).exec(),
    ]);

    // ── Stage 1: Raw Material Inward ──
    // Use receivedQuantity - rejectedQuantity (KG) to match dashboard calculation
    const approvedMats = rawMaterials.filter(m => m.status === 'APPROVED' || m.status === 'PARTIAL_REJECT');
    const totalReceivedKg = approvedMats.reduce((acc, m) => acc + ((m.receivedQuantity || 0) - (m.rejectedQuantity || 0)), 0);
    const totalReceivedQty = approvedMats.reduce((acc, m) => acc + (m.numberOfComponents || 0), 0);
    const totalUsedKg = approvedMats.reduce((acc, m) => acc + (m.usedQuantity || 0), 0);

    // ── Stage 2: WIP (IN_PROGRESS work orders) ──
    const wipWOs = workOrders.filter(wo => wo.status === 'IN_PROGRESS');
    const wipKg = wipWOs.reduce((acc, wo) => acc + (wo.requiredQuantityKg || 0) + (wo.bufferKg || 0), 0);
    const wipQty = wipWOs.reduce((acc, wo) => acc + (wo.targetPartCount || 0), 0);

    // WO lookup map for weight-per-part
    const woMap = new Map(workOrders.map(wo => [String(wo._id), wo]));
    const getWpp = (stage: any): number => {
      const woId = typeof stage.workOrderId === 'string'
        ? stage.workOrderId
        : String(stage.workOrderId?._id || stage.workOrderId || '');
      const wo = woMap.get(woId) as any;
      return wo?.weightPerPart || 0;
    };

    // ── Dynamic process types sorted by canonical order ──
    const PROCESS_ORDER = ['DIE_CASTING', 'COATING', 'MACHINING', 'FINAL_QA', 'OUTSOURCED'];
    const PROCESS_LABELS: Record<string, string> = {
      DIE_CASTING: 'Die Casting',
      COATING: 'Coating',
      MACHINING: 'Machining',
      FINAL_QA: 'Final QA',
      OUTSOURCED: 'Outsourced',
    };
    const PROCESS_COLORS: Record<string, string> = {
      DIE_CASTING: '#b45309',
      COATING: '#6d28d9',
      MACHINING: '#0369a1',
      FINAL_QA: '#065f46',
      OUTSOURCED: '#92400e',
    };

    const distinctTypes = [...new Set(stages.map(s => s.type as string))].sort(
      (a, b) => PROCESS_ORDER.indexOf(a) - PROCESS_ORDER.indexOf(b),
    );

    const processStages = distinctTypes.map(pt => {
      const ptStages = stages.filter(s => s.type === pt && s.status !== 'PENDING');
      let partKg = 0, partQty = 0, reworkKg = 0, reworkQty = 0, lostKg = 0, lostQty = 0, scrapKg = 0;

      for (const s of ptStages) {
        const wpp = getWpp(s);
        partKg  += (s.goodPartsCount     || 0) * wpp;
        partQty += (s.goodPartsCount     || 0);
        reworkKg  += (s.reworkPartsCount   || 0) * wpp;
        reworkQty += (s.reworkPartsCount   || 0);
        lostKg  += (s.rejectedPartsCount  || 0) * wpp;
        lostQty += (s.rejectedPartsCount  || 0);
        scrapKg += (s.scrapWeightKg       || 0);
      }

      // Status breakdown for sub-stage detail
      const byStatus: Record<string, { partQty: number; partKg: number; reworkQty: number; reworkKg: number; lostQty: number; lostKg: number; scrapKg: number }> = {};
      for (const s of ptStages) {
        const wpp = getWpp(s);
        const st = s.status as string;
        if (!byStatus[st]) byStatus[st] = { partQty: 0, partKg: 0, reworkQty: 0, reworkKg: 0, lostQty: 0, lostKg: 0, scrapKg: 0 };
        byStatus[st].partQty  += s.goodPartsCount     || 0;
        byStatus[st].partKg   += (s.goodPartsCount     || 0) * wpp;
        byStatus[st].reworkQty += s.reworkPartsCount   || 0;
        byStatus[st].reworkKg  += (s.reworkPartsCount   || 0) * wpp;
        byStatus[st].lostQty  += s.rejectedPartsCount  || 0;
        byStatus[st].lostKg   += (s.rejectedPartsCount  || 0) * wpp;
        byStatus[st].scrapKg  += s.scrapWeightKg       || 0;
      }

      return {
        processType: pt,
        label: PROCESS_LABELS[pt] || pt,
        color: PROCESS_COLORS[pt] || '#475569',
        stageCount: ptStages.length,
        partStockKg: partKg,
        partStockQty: partQty,
        reworkKg,
        reworkQty,
        lostKg,
        lostQty,
        scrapKg,
        byStatus,
      };
    });

    // ── WO-level material consumption (from raw material consumption logs) ──
    const woConsumptionMap = new Map<string, number>();
    for (const mat of rawMaterials) {
      for (const log of (mat.consumptionLog || [])) {
        const id = String(log.workOrderId);
        woConsumptionMap.set(id, (woConsumptionMap.get(id) || 0) + (log.quantity || 0));
      }
    }

    const woDetails = workOrders
      .sort((a: any, b: any) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
      .map((wo: any) => {
        const woId = String(wo._id);
        const woStagesList = stages.filter(s => String(s.workOrderId?._id || s.workOrderId) === woId);
        const processTypes = [...new Set(woStagesList.map(s => s.type as string))];
        const consumedKg = woConsumptionMap.get(woId) || woConsumptionMap.get(wo.workOrderId || '') || 0;
        const allocatedKg = (wo.requiredQuantityKg || 0) + (wo.bufferKg || 0);
        const woProcessBreakdown = processTypes.map(pt => {
          const ptStages = woStagesList.filter(s => s.type === pt);
          return {
            processType: pt,
            goodParts: ptStages.reduce((s, st) => s + (st.goodPartsCount || 0), 0),
            reworkParts: ptStages.reduce((s, st) => s + (st.reworkPartsCount || 0), 0),
            rejectedParts: ptStages.reduce((s, st) => s + (st.rejectedPartsCount || 0), 0),
            scrapKg: ptStages.reduce((s, st) => s + (st.scrapWeightKg || 0), 0),
          };
        });

        return {
          id: woId,
          workOrderId: wo.workOrderId || `WO-${woId.slice(-6)}`,
          type: wo.type || 'MAIN',
          parentWorkOrderId: wo.parentWorkOrderId
            ? String((wo.parentWorkOrderId as any)?._id || wo.parentWorkOrderId)
            : null,
          partId: wo.partId || '',
          partName: wo.partName || '',
          status: wo.status || '',
          allocatedKg,
          consumedKg: consumedKg > 0 ? consumedKg : allocatedKg,
          targetPartCount: wo.targetPartCount || 0,
          weightPerPart: wo.weightPerPart || 0,
          startDate: wo.startDate || '',
          endDate: wo.endDate || '',
          processes: processTypes,
          stageCount: woStagesList.length,
          processBreakdown: woProcessBreakdown,
          goodParts: woStagesList.reduce((s: number, st: any) => s + (st.goodPartsCount || 0), 0),
          reworkParts: woStagesList.reduce((s: number, st: any) => s + (st.reworkPartsCount || 0), 0),
          rejectedParts: woStagesList.reduce((s: number, st: any) => s + (st.rejectedPartsCount || 0), 0),
        };
      });

    return {
      rawMaterial: {
        totalReceivedKg,
        totalReceivedQty,
        availableKg: Math.max(0, totalReceivedKg - totalUsedKg),
        usedKg: totalUsedKg,
      },
      wip: {
        kg: wipKg,
        qty: wipQty,
        woCount: wipWOs.length,
      },
      processStages,
      workOrders: woDetails,
    };
  }
}
