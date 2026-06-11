import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Platform
} from 'react-native';
import { DataStorage, fmtDate, fmtDateTime } from '../utils/storage';
import { PageHeader, DataTable, Column, StatusBadge, FormModal, FormField, inputStyle, Select, DatePicker } from '../components';
import { WorkOrder, WorkOrderStatus, User, Machine, ProcessStage, ProcessStageStatus } from '../types';
import { useToast } from '../context';

export function WorkOrderScreen() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('sv-SE');

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [woPage, setWoPage] = useState(1);
  const WO_PAGE_SIZE = 10;
  const [showModal, setShowModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedWoForProgress, setSelectedWoForProgress] = useState<WorkOrder | null>(null);
  const [formData, setFormData] = useState<Partial<WorkOrder>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { showToast } = useToast();

  // Helper data
  const [schedules, setSchedules] = useState<any[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [activeBatchDetails, setActiveBatchDetails] = useState<any>(null);
  const [completedParts, setCompletedParts] = useState<string[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [pdcUsers, setPdcUsers] = useState<User[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [partsMaster, setPartsMaster] = useState<any[]>([]);
  const [materialsMaster, setMaterialsMaster] = useState<any[]>([]);
  const [allProcesses, setAllProcesses] = useState<any[]>([]);

  // Start stage modal state (mirrored from ProductionProcessScreen)
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<any>(null);
  const [timingData, setTimingData] = useState({ startDate: '', startTime: '', endDate: '', endTime: '' });
  const [extraDetails, setExtraDetails] = useState<any>({});
  const [operatorOptions, setOperatorOptions] = useState<any[]>([]);
  const [programOptions, setProgramOptions] = useState<any[]>([]);
  const [rawPrograms, setRawPrograms] = useState<any[]>([]);
  const [stageMachines, setStageMachines] = useState<Machine[]>([]);
  const [machineRows, setMachineRows] = useState<any[]>([{ machineId: '', targetQuantity: 0, requiredQuantityKg: 0, operatorId: '', startDate: today, endDate: '', shift: '' }]);
  const useMultiMachine = true; // always multi-machine
  const [primaryMachineId, setPrimaryMachineId] = useState('');
  const [availableAcceptancePoints, setAvailableAcceptancePoints] = useState<any[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);   // ref guard prevents double-submit
  const inputRefs = useRef<any[]>([]);
  const earlyEndResolveRef = useRef<((reason: string | null) => void) | null>(null);
  const [earlyEndPrompt, setEarlyEndPrompt] = useState({ visible: false, message: '', reason: '' });

  const userRole = (currentUser?.role || '').toLowerCase();
  const isTenantAdmin = userRole === 'tenant_admin' || (userRole.includes('tenant') && userRole.includes('admin'));
  const isSuperAdmin = !isTenantAdmin && (userRole.includes('admin') || userRole.includes('super'));
  const isPdcManager = userRole.includes('manager');
  const isPdcDiecasting = userRole.includes('diecasting');
  const isPdcCoating = userRole.includes('coating');
  const isPdcMachining = userRole.includes('machining');

  const getShiftByValue = (shiftName?: string, shiftId?: string) => {
    const normalizedShiftId = shiftId ? String(shiftId) : '';
    return shifts.find(s => {
      const ids = [s?._id, s?.id, s?.shiftId].filter(Boolean).map(String);
      return (normalizedShiftId && ids.includes(normalizedShiftId)) || (shiftName && s?.name === shiftName);
    });
  };

  const getUtcShiftTime = (dateString: string, timeString: string, nextDay = false) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hour = 0, minute = 0, second = 0] = timeString.split(':').map(Number);
    return Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), hour, minute, second);
  };

  const normalizeToken = (value: any) => String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '');
  const isPdcDiecastingUser = (user: User) => normalizeToken(user.role) === 'pdcdiecasting';

  const operatorMatchesCurrentUser = (operator: any) => {
    if (!operator || !currentUser) return false;
    const userTokens = [
      currentUser.id,
      (currentUser as any)._id,
      currentUser.name,
      currentUser.username,
      currentUser.email
    ].map(normalizeToken).filter(Boolean);

    const operatorTokens = typeof operator === 'object'
      ? [operator.id, operator._id, operator.name, operator.username, operator.email].map(normalizeToken).filter(Boolean)
      : [operator].map(normalizeToken).filter(Boolean);

    return operatorTokens.some(op => userTokens.some(user => op === user || op.includes(user) || user.includes(op)));
  };

  useEffect(() => {
    loadData();
    loadHelpers();
    setWoPage(1);
  }, [statusFilter]);

  const loadData = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [user, woList, stgs] = await Promise.all([
        DataStorage.getCurrentUser(),
        DataStorage.getWorkOrders(),
        DataStorage.getProcessStages()
      ]);

      setCurrentUser(user);
      setOrders(woList);
      setStages(stgs);
      // Auto-expand all orders so the full hierarchy (MAIN → SUB → REWORK) is visible without manual expansion
      const allIds = new Set<string>(woList.map((o: any) => String(o._id || o.id)));
      setExpandedIds(allIds);
    } catch (e) {
      showToast({ message: 'Failed to fetch work orders.', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const [rawMaterials, setRawMaterials] = useState<any[]>([]);

  const loadHelpers = async () => {
    try {
      const [sch, bts, grds, cp, mchs, shs, stgs, aps, raw, pts, mats, procs] = await Promise.all([
        DataStorage.getMonthlySchedules(),
        DataStorage.getInventoryBatches(),
        DataStorage.getInventoryGrades(),
        DataStorage.getCompletedParts(),
        DataStorage.getMachines(),
        DataStorage.getShifts(),
        DataStorage.getProcessStages('all'),
        DataStorage.getAcceptancePoints(),
        DataStorage.getRawMaterials(),
        DataStorage.getParts(),
        DataStorage.getMaterials(),
        DataStorage.getProcesses()
      ]);
      setSchedules(sch);
      setBatches(bts);
      setGrades(grds);
      setCompletedParts(cp);
      setMachines(mchs);
      setShifts(shs);
      setStages(stgs);
      setAvailableAcceptancePoints(aps || []);
      setRawMaterials(raw || []);
      setPartsMaster(pts || []);
      setMaterialsMaster(mats || []);
      setAllProcesses((procs || []).sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));

      const ops = await DataStorage.getOperators();
      setOperators(ops);
      const allUsers = await DataStorage.getUsers();
      const ptc = (allUsers || []).filter((u: any) => u.role?.toLowerCase().includes('pdc'));
      setPdcUsers(ptc);
      const vnds = await DataStorage.getVendors();
      setVendors(vnds || []);
    } catch (e) { }
  };

  const handleMasterIdChange = async (val: string) => {
    setFormData({ ...formData, masterId: val });
    if (val) {
      const details = await DataStorage.getBatchDetails(val);
      if (details) {
        setActiveBatchDetails(details);
        setFormData(prev => ({
          ...prev,
          masterId: val,
          materialGrade: details.materialGrade
        }));
      }
    } else {
      setActiveBatchDetails(null);
      setFormData(prev => ({ ...prev, materialGrade: '' }));
    }
  };

  const getRemainingQty = (scheduleId: string, targetQty: number) => {
    const scheduleOrders = orders.filter(o => o.scheduleId === scheduleId);
    const fulfilled = scheduleOrders.reduce((sum, wo) => {
      const id = String((wo as any)._id || wo.id);
      const orderStages = stages.filter(s => String(s.workOrderId?._id || s.workOrderId) === id);
      if (orderStages.length === 0) return sum;

      // Heuristic: take the sum of good parts from the LAST stage of the process chain
      // or simply the max good parts found across stages if it's a linear flow.
      // For multi-stage, we care about the parts that reached the end.
      const maxGood = Math.max(...orderStages.map(s => s.goodPartsCount || 0));
      return sum + maxGood;
    }, 0);

    return Math.max(0, targetQty - fulfilled);
  };

  const hasProductionStarted = (wo: WorkOrder) => {
    if (wo.status === WorkOrderStatus.COMPLETED || wo.status === WorkOrderStatus.IN_PROGRESS) return true;

    const id = String((wo as any)._id || wo.id);
    const woStages = stages.filter(s => String(s.workOrderId?._id || s.workOrderId) === id);

    // Production has started if any stage is beyond PENDING, or has any part counts recorded
    return woStages.some(s =>
      s.status !== ProcessStageStatus.PENDING ||
      (s.goodPartsCount || 0) > 0 ||
      (s.rejectedPartsCount || 0) > 0 ||
      (s.reworkPartsCount || 0) > 0 ||
      (s.verifiedCount || 0) > 0
    );
  };

  const hasAnyChildStarted = (mainId: string) => {
    const childWOs = (orders as any[]).filter(o =>
      String(o.parentWorkOrderId?._id || o.parentWorkOrderId) === mainId && o.type === 'SUB'
    );
    return childWOs.some((child: any) => {
      const childId = String(child._id || child.id);
      return stages.some(s =>
        String(s.workOrderId?._id || s.workOrderId) === childId &&
        s.status !== ProcessStageStatus.PENDING
      );
    });
  };

  const getWORemainingQty = (wo: WorkOrder) => {
    const mainId = String(wo._id || wo.id);
    const target = wo.targetPartCount || 0;

    // Find all related stages (including sub-orders and reworks)
    const relatedOrders = orders.filter(o =>
      String(o._id || o.id) === mainId || o.parentWorkOrderId === mainId
    );
    const relatedIds = relatedOrders.map(o => String(o._id || o.id));

    const relatedStages = stages.filter(s =>
      relatedIds.includes(String(s.workOrderId?._id || s.workOrderId))
    );

    // Sum up good parts from the "final" stages or the furthest progress in each chain
    // For simplicity and matching the user example, we sum all good parts across all submissions
    // but we must be careful not to double count if parts move between stages.

    const totalGood = relatedStages.reduce((sum, s) => sum + (s.goodPartsCount || 0), 0);
    return Math.max(0, target - totalGood);
  };

  const handleScheduleChange = async (scheduleId: string) => {
    const sch = schedules.find(s => (s._id || s.id) === scheduleId);
    if (sch) {
      const remaining = getRemainingQty(scheduleId, sch.requiredQuantity);

      const receiptId = (sch as any).materialReceiptId;
      const partInfo = partsMaster.find(p => p.partId === sch.partId);
      const materialIdForBatch = (sch as any).materialId || partInfo?.materialId || '';
      const specificBatch = receiptId
        ? rawMaterials.find(b => String(b._id || b.id) === String(receiptId))
        : rawMaterials
            .filter(b => b.materialId === materialIdForBatch && b.status === 'APPROVED')
            .sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime())[0] || null;
      const masterId = specificBatch
        ? String(specificBatch.materialId || specificBatch.batchNumber)
        : ((sch as any).materialId || partInfo?.materialId || (sch as any).batchNumber || (sch as any).batchId || '');
      const batchNumber = specificBatch?.batchNumber || (sch as any).batchNumber || '';
      const batchDate = specificBatch ? specificBatch.dateReceived : ((sch as any).date || (sch as any).dateReceived || '');
      const wpp = (sch as any).weightPerPartKg || (sch as any).weightPerPart || partInfo?.weightPerPartKg || 0;
      const baseQty = remaining * wpp;
      const bufferPercent = partInfo?.bufferPercent || 0;
      const bufferKg = (baseQty * bufferPercent / 100);

      setFormData(prev => ({
        ...prev,
        scheduleId: scheduleId,
        partId: sch.partId,
        partName: sch.partName,
        masterId: masterId,
        batchNumber: batchNumber,
        materialGrade: specificBatch?.grade || (sch as any).grade || prev.materialGrade || '',
        batchDate: batchDate,
        targetPartCount: remaining,
        weightPerPart: wpp,
        pricePerPart: (sch as any).pricePerPart || partInfo?.pricePerPart || 0,
        requiredQuantityKg: baseQty,
        bufferKg: bufferKg
      }));

      // Auto-fetch batch details to show stock and grade
      if (specificBatch) {
        const stock = Math.max(0, specificBatch.receivedQuantity - (specificBatch.usedQuantity || 0) - (specificBatch.rejectedQuantity || 0));
        const grade = specificBatch.grade;
        setActiveBatchDetails({
          materialId: specificBatch.materialId,
          grades: [grade],
          materialGrade: grade,
          availableStockKg: stock,
          totalAvailableKg: stock,
          pendingStockKg: 0,
          isApproved: specificBatch.status === 'APPROVED'
        });

        setFormData(prev => ({
          ...prev,
          materialGrade: prev.materialGrade || grade,
          machineAssignments: (prev.machineAssignments && prev.machineAssignments.length > 0)
            ? prev.machineAssignments
            : [{ machineId: '', targetQuantity: remaining, operatorId: '', programId: '' }]
        }));
      } else if (masterId) {
        try {
          const details = await DataStorage.getBatchDetails(masterId);
          if (details) {
            const stock = details.availableStockKg !== undefined ? details.availableStockKg : details.totalAvailableKg || 0;
            const grade = details.materialGrade || (details.grades && details.grades.length > 0 ? details.grades[0] : '');
            setActiveBatchDetails({ ...details, availableStockKg: stock, materialGrade: grade });

            // Sync grade if it was missing in schedule
            setFormData(prev => ({
              ...prev,
              materialGrade: prev.materialGrade || grade,
              machineAssignments: (prev.machineAssignments && prev.machineAssignments.length > 0)
                ? prev.machineAssignments
                : [{ machineId: '', targetQuantity: remaining, operatorId: '', programId: '' }]
            }));
          }
        } catch (e) {
          console.error('[WorkOrderScreen] Failed to fetch batch details for auto-selection:', e);
        }
      } else {
        // If no masterId, still initialize the assignment row if empty
        setFormData(prev => ({
          ...prev,
          machineAssignments: (prev.machineAssignments && prev.machineAssignments.length > 0)
            ? prev.machineAssignments
            : [{ machineId: '', targetQuantity: remaining, operatorId: '', programId: '' }]
        }));
      }
    }
  };

  const handleMachineChange = (val: string) => {
    setFormData({ ...formData, machineId: val });
  };

  const resetModal = () => {
    setShowModal(false);
    setFormData({});
    setActiveBatchDetails(null);
  };

  const handleStartWork = async (wo: WorkOrder) => {
    try {
      const targetId = String(wo._id || wo.id || '');
      console.log('[WorkOrderScreen] handleStartWork START', {
        mongoId: targetId,
        humanId: wo.workOrderId,
        totalStagesInState: stages.length
      });

      // Find associated stage
      console.log('[WorkOrderScreen] Looking for stage matching WO:', targetId);
      let stage = stages.find(s => {
        if (!s) return false;
        const sWoId = String(s.workOrderId?._id || s.workOrderId?.id || s.workOrderId || '');
        const match = sWoId === targetId;
        if (match) console.log('[WorkOrderScreen] Found matching stage:', s._id || s.id);
        return match;
      });

      if (!stage) {
        console.log('[WorkOrderScreen] Stage not found in current state, fetching fresh stages...');

        // Fallback: Refresh stages and try again
        const refreshedStages = await DataStorage.getProcessStages();
        setStages(refreshedStages);
        stage = refreshedStages.find(s => {
          if (!s) return false;
          const sWoId = String(s.workOrderId?._id || s.workOrderId?.id || s.workOrderId || '');
          const match = sWoId === targetId;
          if (match) console.log('[WorkOrderScreen] Found matching stage in refreshed data:', s._id || s.id);
          return match;
        });

      }

      if (!stage) {
        console.log('[WorkOrderScreen] Still no stage found for WO:', wo._id || wo.id);
        showToast({ message: 'No process stage found for this work order. Please refresh the page.', type: 'error' });
        return;
      }


      console.log('[WorkOrderScreen] Stage found:', {
        stageId: stage._id || stage.id,
        status: stage.status,
        type: stage.type
      });

      if (stage.status !== 'PENDING') {
        console.log('[WorkOrderScreen] Stage status is NOT PENDING, it is:', stage.status);
        showToast({ message: `This process is already ${stage.status.replace('_', ' ')}. Use the Production Floor to manage it.`, type: 'info' });
        return;
      }


      console.log('[WorkOrderScreen] SUCCESS: Initializing state. Opening Modal...');
      setSelectedStage(stage);
      setTimeout(() => setShowStartModal(true), 50);

      // Compute remaining qty for MAIN WOs (subtract already-created SWOs)
      const isMainWo = wo.type === 'MAIN' || (!wo.type && !(wo as any).parentWorkOrderId);
      const mainWoIdForCalc = String(wo._id || wo.id || '');
      const allocatedViaSWOs = isMainWo ? getActualAllocated(mainWoIdForCalc) : 0;
      const startableQty = Math.max(1, (wo.targetPartCount || 0) - allocatedViaSWOs);

      setPrimaryMachineId(wo.machineId || '');
      setMachineRows([{ machineId: wo.machineId || '', targetQuantity: startableQty, operatorId: currentUser?.name || '', programId: '', startDate: wo.startDate || today, endDate: '', shift: wo.shift || '' }]);

      // Load machines, operators, programs, batches, parts
      const [mchs, ops, progs, btchs, ptsMaster] = await Promise.all([
        DataStorage.getMachines(stage.type),
        DataStorage.getOperators(stage.type),
        DataStorage.getProgramMasters(),
        DataStorage.getInventoryBatches(),
        DataStorage.getParts()
      ]);

      const isRework = wo.type === 'REWORK';
      const parentWo: any = isRework && wo.parentWorkOrderId
        ? orders.find((o: any) => String(o._id || o.id) === String(wo.parentWorkOrderId))
        : null;

      const effectivePartId = wo.partId || parentWo?.partId;
      const partInfo = ptsMaster.find((p: any) => p.partId === effectivePartId);

      const effectiveStartDate = wo.startDate || parentWo?.startDate;
      const effectiveEndDate = wo.endDate || parentWo?.endDate;

      setStageMachines(mchs);
      const dieCastingOperatorOptions = (ops || [])
        .filter((o: any) => o.process === 'DIE_CASTING' || o.process === 'ALL')
        .map((o: any) => ({
          label: `${o.name}${o.operatorId ? ` (${o.operatorId})` : ''}`,
          value: o.operatorId || o.name
        }));
      setOperatorOptions(dieCastingOperatorOptions);
      const filteredProgs = progs.filter((p: any) => p.processCategory === stage.type || p.processCategory === 'ALL');
      setRawPrograms(filteredProgs);
      setProgramOptions(filteredProgs
        .map((p: any) => ({ label: `${p.programName} (${p.programCode})`, value: p.programCode }))
      );
      setBatches(btchs);

      setTimingData({
        startDate: effectiveStartDate || today,
        startTime: '09:00',
        endDate: effectiveEndDate || today,
        endTime: '18:00'
      });

      let recoveredMasterId = isRework ? '' : (wo.masterId || '');
      let recoveredBatchNumber = isRework ? '' : (wo.batchNumber || '');
      let recoveredBatchDate = isRework ? '' : (wo.batchDate || '');

      if (!isRework && wo.scheduleId) {
        const sch = schedules.find(s => (s._id || s.id) === wo.scheduleId);
        if (sch) {
          if (!recoveredMasterId) recoveredMasterId = (sch as any).materialId || (sch as any).batchNumber || (sch as any).batchId || '';
          if (!recoveredBatchNumber) recoveredBatchNumber = (sch as any).batchNumber || '';
          if (!recoveredBatchDate) recoveredBatchDate = (sch as any).date || (sch as any).dateReceived || '';
        }
      }

      // Fallback: auto-pick most recent approved batch for this material
      if (!isRework && !recoveredBatchNumber) {
        const materialId = (wo as any).materialId || partInfo?.materialId || '';
        if (materialId) {
          const latestBatch = rawMaterials
            .filter(b => b.materialId === materialId && b.status === 'APPROVED')
            .sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime())[0];
          if (latestBatch) {
            recoveredBatchNumber = latestBatch.batchNumber || '';
            if (!recoveredMasterId) recoveredMasterId = latestBatch.materialId || '';
            if (!recoveredBatchDate) recoveredBatchDate = latestBatch.dateReceived || '';
          }
        }
      }

      const effectiveWeightPerPart = wo.weightPerPart || parentWo?.weightPerPart || partInfo?.weightPerPartKg || partInfo?.weightPerPart || 0;
      const effectivePricePerPart = wo.pricePerPart || parentWo?.pricePerPart || partInfo?.pricePerPart || 0;

      // Check if a related SWO already deducted material so we can skip reconciliation
      let siblingAlreadyDeductedMaterial = false;
      let siblingMaterialReceivedKg = 0;
      let mainWoTargetCount = 0;
      let mainWoRequiredKg = 0;
      const isDieCastingStage = (stage.type || '').toUpperCase() === (allProcesses[0]?.processId || 'DIE_CASTING');
      if (isDieCastingStage && !isRework) {
        const isMainWoType = wo.type === 'MAIN' || (!wo.type && !(wo as any).parentWorkOrderId);
        const woId = String((wo as any)._id || (wo as any).id || '');
        if (isMainWoType) {
          // MAIN WO starting remaining batch: check child SWOs for prior material deduction
          const childSWOs = orders.filter((o: any) =>
            String(o.parentWorkOrderId?._id || o.parentWorkOrderId) === woId && o.type === 'SUB'
          );
          siblingMaterialReceivedKg = childSWOs
            .filter((o: any) => o.isMaterialDeducted)
            .reduce((sum: number, o: any) => sum + (o.actualMaterialReceivedKg || 0), 0);
          mainWoTargetCount = (wo as any).targetPartCount || 0;
          mainWoRequiredKg = Math.round(mainWoTargetCount * effectiveWeightPerPart * 100) / 100;
          // Skip reconciliation only if received material covers the full order (≥90%).
          // If only partial material was taken (e.g. for 100 out of 150), remaining batch still needs entry.
          siblingAlreadyDeductedMaterial = siblingMaterialReceivedKg > 0 && mainWoRequiredKg > 0
            ? siblingMaterialReceivedKg >= mainWoRequiredKg * 0.9
            : childSWOs.some((o: any) => o.isMaterialDeducted);
        } else if ((wo as any).type === 'SUB') {
          // SUB WO: check sibling SWOs with same parent
          const parentId = String((wo as any).parentWorkOrderId?._id || (wo as any).parentWorkOrderId || '');
          if (parentId) {
            const siblings = orders.filter((o: any) =>
              String(o.parentWorkOrderId?._id || o.parentWorkOrderId) === parentId &&
              String((o as any)._id || (o as any).id) !== woId
            );
            siblingMaterialReceivedKg = siblings
              .filter((o: any) => o.isMaterialDeducted)
              .reduce((sum: number, o: any) => sum + (o.actualMaterialReceivedKg || 0), 0);
            const mainWo = orders.find((o: any) => String((o as any)._id || (o as any).id) === parentId);
            if (mainWo) {
              mainWoTargetCount = (mainWo as any).targetPartCount || 0;
              mainWoRequiredKg = Math.round(mainWoTargetCount * effectiveWeightPerPart * 100) / 100;
            }
            // Skip reconciliation only if received material covers the full order (≥90%)
            siblingAlreadyDeductedMaterial = siblingMaterialReceivedKg > 0 && mainWoRequiredKg > 0
              ? siblingMaterialReceivedKg >= mainWoRequiredKg * 0.9
              : siblings.some((o: any) => o.isMaterialDeducted);
          }
        }
      }

      setExtraDetails({
        shift: wo.shift || '',
        shiftId: wo.shiftId || '',
        operatorId: wo.operatorId || currentUser?.name || '',
        masterId: recoveredMasterId,
        batchNumber: recoveredBatchNumber,
        batchDate: recoveredBatchDate,
        materialGrade: wo.materialGrade || parentWo?.materialGrade || '',
        pricePerPart: effectivePricePerPart,
        weightPerPart: effectiveWeightPerPart,
        partsType: (wo as any).partsType || (wo as any).partType || '',
        partsPerCycle: Number((wo as any).partsPerCycle || 0),
        targetPartCount: startableQty,
        requiredQuantityKg: isRework ? 0 : (startableQty * (wo.weightPerPart || 0) || wo.requiredQuantityKg || 0),
        partName: wo.partName || parentWo?.partName || partInfo?.partName || 'N/A',
        isFirstStage: !siblingAlreadyDeductedMaterial && isDieCastingStage,
        isRework,
        siblingAlreadyDeductedMaterial,
        siblingMaterialReceivedKg,
        mainWoTargetCount,
        mainWoRequiredKg,
        actualMaterialReceivedKg: 0,
        excessMaterialReceivedKg: 0,
        actualStartDate: effectiveStartDate ? new Date(effectiveStartDate).toISOString().split('T')[0] : '',
        actualEndDate: effectiveEndDate ? new Date(effectiveEndDate).toISOString().split('T')[0] : '',
        userStartDate: '',
        userEndDate: '',

        CustId: (wo as any).CustId || (wo as any).custId || currentUser?.tenantId || '',
        PlantId: (wo as any).PlantId || (wo as any).plantId || (currentUser as any)?.plantId || ''
      });
      // If batch already assigned, fetch details
      if (recoveredMasterId) {
        const details = await DataStorage.getBatchDetails(recoveredMasterId);
        setActiveBatchDetails(details);
      }

      console.log('[WorkOrderScreen] SUCCESS: Helper data loaded. Opening Modal now.');
    } catch (e: any) {
      console.error('[WorkOrderScreen] handleStartWork CRASH:', e);
      showToast({ message: 'Failed to initialize production popup: ' + e.message, type: 'error' });
    }


  };

  const addMachineRow = () => {
    setMachineRows([...machineRows, { machineId: '', targetQuantity: 0, operatorId: '', programId: '', startDate: today, endDate: '', shift: '' }]);
  };

  const getProgramStartDetails = (programCode?: string) => {
    const prog = rawPrograms.find((p: any) => p.programCode === programCode || p.programId === programCode);
    const stageType = String(selectedStage?.type || '').toUpperCase();
    const processConfig = (prog?.process || []).find((p: any) =>
      String(p.processId || '').toUpperCase() === stageType ||
      String(p.processName || '').toUpperCase().replace(/[\s_]+/g, '') === stageType.replace(/[\s_]+/g, '')
    ) || prog?.process?.[0] || {};

    return {
      programId: programCode || '',
      weightPerPart: prog?.weightPerPart,
      pricePerPart: prog?.pricePerPart,
      totalCycleTimeSeconds: Number(processConfig?.cycleTime?.totalCycleTimeSeconds || processConfig?.totalCycleTimeSeconds || 0),
      selectPartType: processConfig?.selectPartType || '',
      partsType: processConfig?.selectPartType || '',
      partsPerCycle: Number(processConfig?.partsPerCycle || 0),
    };
  };

  const removeMachineRow = (idx: number) => {
    if (machineRows.length > 1) {
      const updated = [...machineRows];
      updated.splice(idx, 1);
      setMachineRows(updated);
    }
  };

  const dateOnly = (value?: any) => {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('sv-SE');
  };

  const sameKey = (a?: any, b?: any) => String(a || '').trim() !== '' && String(a || '').trim() === String(b || '').trim();

  const getWorkOrderForStage = (stage: any) => {
    const wo = stage?.workOrderId;
    if (wo && typeof wo === 'object') return wo;
    const id = String(wo || '');
    return orders.find((o: any) => String(o._id || o.id) === id);
  };

  const isSubWorkOrderStage = (stage: any) => {
    const wo = getWorkOrderForStage(stage);
    return stage?.workOrderType === 'SUB' || wo?.type === 'SUB';
  };

  const requestEarlyEndReason = (message: string) => new Promise<string | null>((resolve) => {
    earlyEndResolveRef.current = resolve;
    setEarlyEndPrompt({ visible: true, message, reason: '' });
  });

  const closeEarlyEndPrompt = (reason: string | null) => {
    const resolve = earlyEndResolveRef.current;
    earlyEndResolveRef.current = null;
    setEarlyEndPrompt({ visible: false, message: '', reason: '' });
    resolve?.(reason);
  };

  const submitEarlyEndPrompt = () => {
    const reason = earlyEndPrompt.reason.trim();
    if (!reason) {
      showToast({ message: 'Reason is required to end the previous process.', type: 'warning' });
      return;
    }
    closeEarlyEndPrompt(reason);
  };

  const findSubWorkOrderMachineConflict = (row: any) => {
    const rowDate = dateOnly(row.startDate || today);
    const rowShiftKeys = [row.shift, row.shiftId, extraDetails.shift, extraDetails.shiftId].filter(Boolean);
    const selectedStageId = String(selectedStage?._id || selectedStage?.id || '');

    for (const stage of stages) {
      const stageId = String(stage?._id || stage?.id || '');
      if (!stageId || stageId === selectedStageId) continue;
      if (stage.status !== ProcessStageStatus.IN_PROGRESS) continue;
      if (!isSubWorkOrderStage(stage)) continue;
      const wo = getWorkOrderForStage(stage);
      if (wo?.status !== WorkOrderStatus.IN_PROGRESS) continue;

      for (const assignment of (stage.machineAssignments || []) as any[]) {
        const assignmentStatus = assignment.Status || assignment.status || ProcessStageStatus.IN_PROGRESS;
        if (assignmentStatus !== ProcessStageStatus.IN_PROGRESS) continue;
        if (!sameKey(assignment.machineId, row.machineId)) continue;
        if (dateOnly(assignment.productionDate || assignment.startDate || stage.productionDate) !== rowDate) continue;

        const assignmentShiftKeys = [assignment.shift, assignment.shiftId, stage.shift, stage.shiftId].filter(Boolean);
        const sameShift = rowShiftKeys.some(rowShift => assignmentShiftKeys.some(stageShift => sameKey(rowShift, stageShift)));
        if (!sameShift) continue;

        return { stage, assignment, stageId };
      }
    }

    return null;
  };

  const endConflictingSubWorkOrders = async () => {
    const endedKeys = new Set<string>();
    const endedMachineKeys = new Set<string>();

    for (const row of machineRows) {
      const conflict = findSubWorkOrderMachineConflict(row);
      if (!conflict) continue;

      const rowDate = dateOnly(row.startDate || today);
      const rowShift = row.shift || row.shiftId || extraDetails.shift || extraDetails.shiftId || '';
      const conflictKey = `${conflict.stageId}:${row.machineId}:${rowDate}:${rowShift}`;
      const machineKey = `${row.machineId}:${rowDate}:${rowShift}`;
      if (endedKeys.has(conflictKey)) {
        endedMachineKeys.add(machineKey);
        continue;
      }

      const wo = getWorkOrderForStage(conflict.stage);
      const machineLabel = machines.find(m => sameKey((m as any).machineId, row.machineId))?.name || row.machineId;
      const workOrderLabel = conflict.stage.workOrderNumber || wo?.mainWorkOrderId || wo?.workOrderId || 'previous work order';
      const subWorkOrderLabel = wo?.workOrderId || conflict.stage.workOrderNumber || String(wo?._id || wo?.id || conflict.stageId);
      const message = `Machine ${machineLabel} is already assigned to Work Order ${workOrderLabel} / Sub Work Order ${subWorkOrderLabel} for ${rowDate} and shift ${rowShift}. Do you want to end the current process?`;

      const reason = await requestEarlyEndReason(message);
      if (!reason) {
        return false;
      }

      await DataStorage.earlyEndMachineAssignment(conflict.stageId, {
        userId: currentUser?.id || currentUser?._id || '',
        machineId: row.machineId,
        productionDate: rowDate,
        shift: row.shift || extraDetails.shift || conflict.assignment.shift || conflict.stage.shift || '',
        shiftId: row.shiftId || extraDetails.shiftId || conflict.assignment.shiftId || conflict.stage.shiftId || '',
        reason,
        endTime: Date.now(),
      });
      endedKeys.add(conflictKey);
      endedMachineKeys.add(machineKey);
    }

    return { ok: true, endedMachineKeys };
  };

  const handleStartSubmit = async () => {
    const selectedStageId = selectedStage?._id || selectedStage?.id;
    if (!selectedStageId) return;
    if (isSubmittingRef.current) return;   // prevent double-tap / double-click

    // 1. Basic Mandatory Fields
    const isDieCasting = (selectedStage?.type || '').toUpperCase() === (allProcesses[0]?.processId || 'DIE_CASTING');

    if ((extraDetails.targetPartCount || 0) <= 0) {
      showToast({ message: 'Target Quantity is mandatory and must be > 0.', type: 'warning' });
      return;
    }

    if (isDieCasting && !extraDetails.isExternalVendor && (!extraDetails.pricePerPart || Number(extraDetails.pricePerPart) <= 0)) {
      showToast({ message: 'Price Per Part (₹) is mandatory for the Die Casting process.', type: 'warning' });
      return;
    }

    const totalMachineQty = machineRows.reduce((sum: number, r: any) => sum + (r.targetQuantity || 0), 0);

    // 2. Vendor vs In-House Validation
    if (extraDetails.isExternalVendor) {
      if (!extraDetails.vendorName) {
        showToast({ message: 'Vendor selection is mandatory for external production.', type: 'warning' });
        return;
      }
    } else {
      // 3. Machine & Operator Validation (multi-machine)
      if (machineRows.some(r => !r.machineId || !r.operatorId || !r.shift || !r.startDate || !r.programId || (r.targetQuantity || 0) <= 0)) {
        showToast({ message: 'Machine, Operator, Shift, Program, Start Date, and Quantity are mandatory for all rows.', type: 'warning' });
        return;
      }
      for (let i = 0; i < machineRows.length; i++) {
        const r = machineRows[i];
        if (r.endDate && r.endDate < r.startDate) {
          showToast({ message: `Row ${i + 1}: End Date cannot be before Start Date.`, type: 'error' });
          return;
        }
      }
      const rowKeys = new Set<string>();
      for (let i = 0; i < machineRows.length; i++) {
        const r = machineRows[i];
        const rowDate = dateOnly(r.startDate || today);
        const rowShift = String(r.shift || r.shiftId || '').trim();
        const rowKey = `${String(r.machineId || '').trim()}:${rowDate}:${rowShift}`;
        if (rowKeys.has(rowKey)) {
          const machineLabel = machines.find(m => sameKey((m as any).machineId, r.machineId))?.name || r.machineId;
          showToast({ message: `Machine ${machineLabel} is selected more than once for ${rowDate} and shift ${rowShift}.`, type: 'warning' });
          return;
        }
        rowKeys.add(rowKey);
      }
      if (totalMachineQty > (extraDetails.targetPartCount || 0)) {
        showToast({ message: `Total allocated (${totalMachineQty}) exceeds target quantity (${extraDetails.targetPartCount}).`, type: 'warning' });
        return;
      }
    }

    // 4. Inventory Check (First Stage) — skip if sibling already deducted material
    if (isDieCasting && !extraDetails.isExternalVendor && extraDetails.isFirstStage) {
      if (!extraDetails.masterId) {
        showToast({ message: 'Material ID is missing. Cannot start production.', type: 'error' });
        return;
      }
      const hasUnfilledRow = machineRows.some((r: any) => !r.actualMaterialReceivedKg || r.actualMaterialReceivedKg <= 0);
      if (hasUnfilledRow) {
        showToast({ message: 'Actual Received (KG) is mandatory for each machine row in Die Casting.', type: 'warning' });
        return;
      }
      if (activeBatchDetails && (activeBatchDetails.availableStockKg || 0) < (extraDetails.requiredQuantityKg || 0)) {
        showToast({ message: `Insufficient inventory. Available: ${activeBatchDetails.availableStockKg}kg, Required: ${extraDetails.requiredQuantityKg}kg.`, type: 'error' });
        return;
      }
    }

    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const conflictResult = await endConflictingSubWorkOrders();
      if (!conflictResult) return;
      const endedMachineKeys = conflictResult.endedMachineKeys;

      const selectedShift = getShiftByValue(extraDetails.shift, extraDetails.shiftId);
      const shiftStart = selectedShift?.startTime || timingData.startTime || '00:00';
      const shiftEnd = selectedShift?.endTime || timingData.endTime || '00:00';
      const newStartTime = Date.now();
      const startDetails = {
        programId: extraDetails.programId || '',
        totalCycleTimeSeconds: Number(extraDetails.totalCycleTimeSeconds || extraDetails.cycleTime || 0),
        partsType: extraDetails.partsType || '',
        selectPartType: extraDetails.selectPartType || extraDetails.partsType || '',
        partsPerCycle: Number(extraDetails.partsPerCycle || 0),
        pricePerPart: Number(extraDetails.pricePerPart || 0),
        shiftId: extraDetails.shiftId || selectedShift?.shiftId || selectedShift?._id || selectedShift?.id || '',
        custId: extraDetails.custId || extraDetails.CustId || currentUser?.tenantId || '',
        plantId: extraDetails.plantId || extraDetails.PlantId || (currentUser as any)?.plantId || ''
      };
      // Sum per-row actual received KG for inventory deduction
      const totalActualReceivedKg = (machineRows as any[]).reduce((sum: number, r: any) => sum + (r.actualMaterialReceivedKg || 0), 0);

      const payload = {
        plannedTiming: `${shiftStart} - ${shiftEnd}`,
        machineId: primaryMachineId,
        machineAssignments: machineRows.map((r: any) => {
          const sd = r.startDate || today;
          const ed = r.endDate || sd;
          const rowShift = getShiftByValue(r.shift || extraDetails.shift, r.shiftId || extraDetails.shiftId);
          const rowShiftId = r.shiftId || rowShift?.shiftId || rowShift?._id || rowShift?.id || startDetails.shiftId || '';
          const rowShiftStart = rowShift?.startTime || shiftStart;
          const rowShiftEnd = rowShift?.endTime || shiftEnd;
          const rowProgramDetails = getProgramStartDetails(r.programId || extraDetails.programId);
          const rowShiftKey = r.shift || r.shiftId || extraDetails.shift || extraDetails.shiftId || '';
          const wasMachineAlreadyRunning = endedMachineKeys.has(`${r.machineId}:${dateOnly(sd)}:${rowShiftKey}`);
          return {
            ...r,
            ...startDetails,
            ...rowProgramDetails,
            targetPartCount: r.targetQuantity,
            startDate: sd,
            StartTime: wasMachineAlreadyRunning ? newStartTime : getUtcShiftTime(sd, rowShiftStart, !!rowShift?.startNextDay),
            endDate: ed,
            EndTime: getUtcShiftTime(ed, rowShiftEnd, !!rowShift?.endNextDay),
            Status: ProcessStageStatus.IN_PROGRESS,
            shift: r.shift || extraDetails.shift || 'General',
            shiftId: rowShiftId,
            programId: r.programId || extraDetails.programId || '',
            pricePerPart: Number(rowProgramDetails.pricePerPart ?? extraDetails.pricePerPart ?? 0),
            shiftIdN: rowShiftId,
            actualMaterialReceivedKg: r.actualMaterialReceivedKg || 0,
          };
        }),
        extraDetails: {
          ...extraDetails,
          ...startDetails,
          productionDate: today,
          shift: extraDetails.shift || 'General',
          actualMaterialReceivedKg: totalActualReceivedKg || extraDetails.actualMaterialReceivedKg || 0,
        }
      };

      const wo = selectedStage?.workOrderId as any;
      const isMainWo = !extraDetails.isExternalVendor && (wo?.type === 'MAIN' || (!wo?.type && !(wo as any)?.parentWorkOrderId));

      if (isMainWo) {
        // For MAIN WOs: auto-create a SWO for the submitted qty and start its stage.
        // This keeps the MAIN WO stage PENDING so the Start button stays for remaining qty.
        const mainWoId = String(wo?._id || wo?.id || '');
        const swoPayload = {
          type: 'SUB' as const,
          parentWorkOrderId: mainWoId,
          mainWorkOrderId: wo?.workOrderId,
          partId: wo?.partId,
          processType: selectedStage?.type,
          startDate: wo?.startDate || today,
          endDate: wo?.endDate || today,
          targetPartCount: totalMachineQty,
          machineAssignments: machineRows.map((r: any) => ({ ...r, targetPartCount: r.targetQuantity })),
          masterId: extraDetails.masterId,
          materialGrade: extraDetails.materialGrade,
          weightPerPart: extraDetails.weightPerPart,
          pricePerPart: extraDetails.pricePerPart,
          requiredQuantityKg: totalMachineQty * (extraDetails.weightPerPart || 0),
          scheduleId: wo?.scheduleId,
          operatorId: machineRows[0]?.operatorId,
          machineId: machineRows[0]?.machineId,
        };

        // Fetch fresh data (not stale React state) to sync existing child SWO targetPartCounts
        // with actual machineAssignment totals — frees quota for the new SWO.
        const [freshOrders, freshStages] = await Promise.all([
          DataStorage.getWorkOrders(),
          DataStorage.getProcessStages(),
        ]);
        const childSWOs = (freshOrders as any[]).filter((o: any) =>
          String(o.parentWorkOrderId?._id || o.parentWorkOrderId) === mainWoId && o.type === 'SUB'
        );
        for (const subWo of childSWOs) {
          const subWoId = String(subWo._id || subWo.id || '');
          const subStage = (freshStages as any[]).find((s: any) => String(s.workOrderId?._id || s.workOrderId) === subWoId);
          if (subStage && subStage.status !== 'PENDING' && subStage.status !== 'COMPLETED') {
            const actualQty = ((subStage.machineAssignments || []) as any[]).reduce(
              (sum: number, ma: any) => sum + (ma.targetQuantity || ma.qty || 0), 0
            );
            if (actualQty > 0 && actualQty < (subWo.targetPartCount || 0)) {
              await DataStorage.updateWorkOrder(subWoId, { targetPartCount: actualQty });
            }
          }
        }

        const swoResult = await DataStorage.createWorkOrder(swoPayload);
        if (!swoResult?.success) {
          showToast({ message: 'Failed to create sub work order for this batch.', type: 'error' });
          return;
        }

        const newSwoId = String(swoResult.data?._id || swoResult.data?.id || '');

        // Find the auto-created stage for the new SWO (backend creates it on WO creation)
        let swoStage: any = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const allStages = await DataStorage.getProcessStages();
          swoStage = allStages.find((s: any) => String(s.workOrderId?._id || s.workOrderId) === newSwoId);
          if (swoStage) break;
          await new Promise(r => setTimeout(r, 400));
        }

        if (!swoStage?._id) {
          // Rollback: delete the orphaned SWO so it doesn't permanently consume parent quota
          try { await DataStorage.deleteWorkOrder(newSwoId); } catch { }
          showToast({ message: 'Could not find process stage for the new batch. Please try again.', type: 'error' });
          setShowStartModal(false);
          await loadData();
          return;
        }

        const ok = await DataStorage.startProcessStage(swoStage._id, currentUser?.id || '', payload.plannedTiming, payload.machineId, payload.machineAssignments, payload.extraDetails);
        if (ok) {
          setShowStartModal(false);
          await loadData();
          const remaining = (extraDetails.targetPartCount || 0) - totalMachineQty;
          if (remaining > 0) {
            showToast({ message: `Started ${totalMachineQty} parts. Remaining ${remaining} pcs can be started anytime.`, type: 'success' });
          } else {
            showToast({ message: 'All parts started successfully.', type: 'success' });
          }
        } else {
          // Rollback: stage start failed, delete the SWO so quota is not wasted
          try { await DataStorage.deleteWorkOrder(newSwoId); } catch { }
          showToast({ message: 'Failed to start production. Batch rolled back — please try again.', type: 'error' });
        }
      } else {
        // SUB / REWORK / external vendor: direct stage start
        const ok = await DataStorage.startProcessStage(selectedStageId, currentUser?.id || '', payload.plannedTiming, payload.machineId, payload.machineAssignments, payload.extraDetails);
        if (ok) {
          setShowStartModal(false);
          await loadData();
          showToast({ message: 'Production started successfully.', type: 'success' });
        } else {
          showToast({ message: 'Failed to start production.', type: 'error' });
        }
      }
    } catch (e: any) {
      showToast({ message: e.message || 'Error starting stage', type: 'error' });
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSignalQI = async (stage: ProcessStage) => {
    if (!currentUser) return;
    try {
      setLoading(true);
      const ok = await DataStorage.signalProcessStageQI(stage._id!, currentUser.id);
      if (ok) {
        showToast({ message: 'Production finished and signaled to QI.', type: 'success' });
        await loadData();
      }
    } catch (e: any) {
      showToast({ message: 'Failed to signal QI: ' + e.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const isAdminOrManager = isSuperAdmin || isPdcManager;
    const isRequirementMissing = !formData.startDate || !formData.endDate || !formData.partId || !formData.targetPartCount || (isSuperAdmin && !formData.requiredQuantityKg);
    if (isRequirementMissing) {
      const missingFields = [];
      if (!formData.startDate) missingFields.push('Start Date');
      if (!formData.endDate) missingFields.push('End Date');
      if (!formData.partId) missingFields.push('Part');
      if (!formData.targetPartCount) missingFields.push('Target Qty');
      if (isSuperAdmin && !formData.requiredQuantityKg) missingFields.push('Required KG');

      const msg = `Please fill all required fields: ${missingFields.join(', ')}.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (formData.startDate && formData.startDate < today) {
      const msg = 'Start Date cannot be in the past.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Error', msg);
      return;
    }

    if (formData.startDate && formData.endDate && formData.endDate < formData.startDate) {
      if (Platform.OS === 'web') window.alert('End Date cannot be before Start Date.');
      else Alert.alert('Error', 'End Date cannot be before Start Date.');
      return;
    }

    // All Fields Mandatory Validation
    if (!formData.scheduleId) {
      showToast({ message: 'Select Schedule Entry / Part is mandatory.', type: 'warning' });
      return;
    }
    if (!formData.initialStage) {
      showToast({ message: 'Initial Production Stage is mandatory.', type: 'warning' });
      return;
    }
    // These fields are only visible and mandatory for SuperAdmin
    if (isSuperAdmin) {
      if (!formData.shifts || formData.shifts.length === 0) {
        showToast({ message: 'Assign Shift(s) is mandatory.', type: 'warning' });
        return;
      }
      if (!formData.pdcManagerId) {
        showToast({ message: 'Assign PDC Technician is mandatory.', type: 'warning' });
        return;
      }
    }

    // Machine assignment validation — partial allocation allowed; remaining parts can be added later via "+ SWO"
    if (isPdcManager || isSuperAdmin) {
      const assignments = (formData.machineAssignments || []).filter((a: any) => a.machineId || a.operatorId || (a.targetQuantity || 0) > 0);
      if (assignments.length > 0) {
        const totalAssigned = assignments.reduce((sum: number, a: any) => sum + (a.targetQuantity || 0), 0);
        if (totalAssigned > (formData.targetPartCount || 0)) {
          showToast({ message: `Total assigned (${totalAssigned}) exceeds target quantity (${formData.targetPartCount}).`, type: 'warning' });
          return;
        }
        if (assignments.some((a: any) => !a.operatorId)) {
          showToast({ message: 'An Operator must be selected for all assignments.', type: 'warning' });
          return;
        }
        if (assignments.some((a: any) => (a.targetQuantity || 0) <= 0)) {
          showToast({ message: 'Quantity must be greater than zero for all assignments.', type: 'warning' });
          return;
        }
        formData.machineAssignments = assignments;
      } else {
        formData.machineAssignments = [];
      }
    }

    try {
      const payload = {
        ...formData,
        processType: formData.processType || formData.initialStage,
        pdcManagerId: currentUser?.id || currentUser?._id
      };

      // Map first assignment to top-level for legacy support
      if (payload.machineAssignments && payload.machineAssignments.length > 0) {
        payload.machineId = payload.machineAssignments[0].machineId;
        payload.operatorId = payload.machineAssignments[0].operatorId;
      }

      const id = (formData as any)._id || formData.id;
      let result: any;

      if (id) {
        const updated = await DataStorage.updateWorkOrder(id, payload);

        // SYNC SUB-ORDERS ON EDIT
        if (updated && isPdcManager && payload.machineAssignments && payload.machineAssignments.length > 0) {
          // 1. Find existing sub-orders for this parent
          const existingSubs = orders.filter(o => String(o.parentWorkOrderId || (o as any).parentWorkOrderId?._id) === String(id) && o.type === 'SUB');

          // 2. Delete existing sub-orders that have NOT started production
          for (const sub of existingSubs) {
            const subId = sub._id || sub.id;
            if (!subId) continue;
            const hasStarted = stages.some(s => String(s.workOrderId?._id || s.workOrderId) === String(subId) && s.status !== 'PENDING');
            if (!hasStarted) {
              await DataStorage.deleteWorkOrder(subId);
            }
          }

          // 3. Re-create sub-orders from the new assignments
          for (const ma of payload.machineAssignments) {
            const subPayload = {
              type: 'SUB' as const,
              parentWorkOrderId: id,
              mainWorkOrderId: payload.workOrderId,
              partId: payload.partId,
              processType: payload.processType || payload.initialStage || 'DIE_CASTING',
              startDate: payload.startDate,
              endDate: payload.endDate,
              targetPartCount: ma.targetQuantity,
              operatorId: ma.operatorId,
              machineId: ma.machineId,
              masterId: payload.masterId,
              batchDate: payload.batchDate,
              materialGrade: payload.materialGrade,
              pricePerPart: payload.pricePerPart,
              weightPerPart: payload.weightPerPart,
              requiredQuantityKg: (ma.targetQuantity || 0) * (payload.weightPerPart || 0),
              partName: payload.partName,
              scheduleId: payload.scheduleId
            };
            await DataStorage.createWorkOrder(subPayload);
          }
        }

        result = updated ? { success: true, message: 'Work Order updated successfully.' } : { success: false, message: 'Failed to update work order.' };
      } else {
        result = await DataStorage.createWorkOrder(payload);

        // If pdc_manager and has assignments, create SUB work orders automatically
        if (result.success && isPdcManager && payload.machineAssignments && payload.machineAssignments.length > 0) {
          const mainWo = result.data;
          for (const ma of payload.machineAssignments) {
            const subPayload = {
              type: 'SUB' as const,
              parentWorkOrderId: mainWo._id || mainWo.id,
              mainWorkOrderId: mainWo.workOrderId,
              partId: mainWo.partId,
              processType: mainWo.processType || mainWo.initialStage || 'DIE_CASTING',
              startDate: mainWo.startDate,
              endDate: mainWo.endDate,
              targetPartCount: ma.targetQuantity,
              operatorId: ma.operatorId,
              machineId: ma.machineId,
              masterId: mainWo.masterId,
              batchDate: mainWo.batchDate,
              materialGrade: mainWo.materialGrade,
              pricePerPart: mainWo.pricePerPart,
              weightPerPart: mainWo.weightPerPart,
              requiredQuantityKg: (ma.targetQuantity || 0) * (mainWo.weightPerPart || 0),
              partName: mainWo.partName,
              scheduleId: mainWo.scheduleId
            };
            await DataStorage.createWorkOrder(subPayload);
          }
        }
      }

      if (result.success) {
        showToast({ message: result.message, type: 'success' });
        resetModal();
        loadData();
      } else {
        if (Platform.OS === 'web') window.alert(result.message || 'Operation failed.');
        else Alert.alert('Error', result.message || 'Operation failed.');
      }
    } catch (e) {
      showToast({ message: 'Operation failed.', type: 'error' });
    }
  };

  const handleDelete = (id: string) => {
    console.log('[WorkOrderScreen] Attempting to delete WO:', id);
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this work order?')) {
        (async () => {
          const ok = await DataStorage.deleteWorkOrder(id);
          if (ok) {
            // Deep local purge: remove parent and all its sub-orders/reworks immediately
            setOrders(prev => prev.filter(o =>
              String(o._id || o.id) !== id &&
              String(o.parentWorkOrderId?._id || o.parentWorkOrderId) !== id
            ));
            showToast({ message: 'Work Order deleted.', type: 'success' });
            await loadData();
            await loadHelpers();
          }
        })();
      }
      return;
    }

    Alert.alert(
      'Delete Work Order',
      'Are you sure you want to delete this work order?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await DataStorage.deleteWorkOrder(id);
            if (ok) {
              // Deep local purge: remove parent and all its sub-orders/reworks immediately
              setOrders(prev => prev.filter(o =>
                String(o._id || o.id) !== id &&
                String(o.parentWorkOrderId?._id || o.parentWorkOrderId) !== id
              ));
              showToast({ message: 'Work Order deleted.', type: 'success' });
              await loadData();
              await loadHelpers();
            }
          }
        }
      ]
    );
  };

  const handleComplete = async (id: string) => {
    const ok = await DataStorage.updateWorkOrder(id, { status: WorkOrderStatus.COMPLETED });
    if (ok) {
      showToast({ message: 'Work Order marked as completed.', type: 'success' });
      loadData();
    }
  };

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showSubModal, setShowSubModal] = useState(false);
  const [parentForSub, setParentForSub] = useState<WorkOrder | null>(null);
  const [subFormData, setSubFormData] = useState<any>({});

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const openAddSub = (parent: WorkOrder) => {
    setParentForSub(parent);
    setSubFormData({
      type: 'SUB',
      parentWorkOrderId: parent._id || parent.id,
      mainWorkOrderId: parent.workOrderId,
      partId: parent.partId,
      processType: allProcesses[0]?.processId || 'DIE_CASTING',
      startDate: '',
      targetPartCount: 0,
      machineAssignments: [],
    });
    setShowSubModal(true);
  };

  const handleSaveSub = async () => {
    if (!subFormData.processType || !subFormData.targetPartCount) {
      showToast({ message: 'Process and Target Qty are required.', type: 'warning' });
      return;
    }

    const assignments = subFormData.machineAssignments || [];
    if (assignments.length === 0) {
      showToast({ message: 'At least one machine assignment is required.', type: 'warning' });
      return;
    }
    if (assignments.some((a: any) => !a.startDate)) {
      showToast({ message: 'Start Date is required for every assignment.', type: 'warning' });
      return;
    }
    if (assignments.some((a: any) => a.endDate && a.endDate < a.startDate)) {
      showToast({ message: 'End Date cannot be before Start Date.', type: 'warning' });
      return;
    }
    const totalAssigned = assignments.reduce((s: number, a: any) => s + (a.targetQuantity || 0), 0);
    if (totalAssigned !== (subFormData.targetPartCount || 0)) {
      showToast({ message: `Total assigned (${totalAssigned}) must match SWO target (${subFormData.targetPartCount}).`, type: 'warning' });
      return;
    }
    if (parentForSub) {
      const parentId = String(parentForSub._id || parentForSub.id);
      const existingSwoTotal = orders
        .filter(o => o.type === 'SUB' && (String(o.parentWorkOrderId) === parentId || String((o.parentWorkOrderId as any)?._id) === parentId))
        .reduce((s, o) => s + (o.targetPartCount || 0), 0);
      if (existingSwoTotal + (subFormData.targetPartCount || 0) > (parentForSub.targetPartCount || 0)) {
        const remaining = (parentForSub.targetPartCount || 0) - existingSwoTotal;
        showToast({ message: `Exceeds parent capacity. Remaining allottable: ${remaining} pcs.`, type: 'warning' });
        return;
      }
    }

    // Compute SWO start/end from assignment date range
    const allDates = assignments.flatMap((a: any) => [a.startDate, a.endDate || a.startDate].filter(Boolean)).sort();
    const computedStart = allDates[0] || today;
    const computedEnd = allDates[allDates.length - 1] || today;

    const payload = { ...subFormData, startDate: computedStart, endDate: computedEnd };
    if (payload.machineAssignments && payload.machineAssignments.length > 0) {
      payload.machineId = payload.machineAssignments[0].machineId;
      payload.operatorId = payload.machineAssignments[0].operatorId;
    }

    const result = await DataStorage.createWorkOrder(payload);
    if (result.success) {
      showToast({ message: 'Sub-Work Order created.', type: 'success' });
      setShowSubModal(false);
      loadData();
    } else {
      showToast({ message: result.message || 'Failed to create SWO', type: 'error' });
    }
  };

  const selectedSchedule = schedules.find(s => (s._id || s.id || s.partId) === formData.partId);
  const getMasterIdDisplay = () => {
    const materialId = String(formData.masterId || '').trim();
    if (!materialId) return '—';

    const material = materialsMaster.find(m => String(m.materialId || '').trim() === materialId);
    if (material?.materialName) return `${materialId} | ${material.materialName}`;

    const schedule = schedules.find(s => String(s._id || s.id) === String(formData.scheduleId));
    const part = partsMaster.find(p => p.partId === (schedule?.partId || formData.partId));
    const partMaterial = part?.materialId
      ? materialsMaster.find(m => String(m.materialId || '').trim() === String(part.materialId).trim())
      : null;

    return partMaterial?.materialName ? `${materialId} | ${partMaterial.materialName}` : materialId;
  };

  const canCreate = isPdcManager;

  // Grouping logic: Only show MAIN orders at top level
  // Also exclude any order with a parentWorkOrderId — these are always children (SUB / REWORK),
  // even if the type field is missing due to legacy data.
  const mainOrders = orders.filter(o =>
    (o.type === 'MAIN' || !o.type) && !o.parentWorkOrderId
  );
  const subOrdersMap = orders.reduce((acc, o) => {
    if (o.parentWorkOrderId) {
      const pid = String(o.parentWorkOrderId);
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(o);

      // Also try to find parent and use its human workOrderId as a key if it exists
      const parent = orders.find(po => String(po._id || po.id) === pid);
      if (parent && parent.workOrderId) {
        const humanId = String(parent.workOrderId);
        if (!acc[humanId]) acc[humanId] = [];
        if (!acc[humanId].includes(o)) acc[humanId].push(o);
      }
    }
    return acc;
  }, {} as Record<string, WorkOrder[]>);

  // Returns how many parts are actually allocated under a MAIN WO.
  // For SUB WOs whose stage is already IN_PROGRESS, we use the machineAssignment total
  // (the qty actually running) rather than the WO's targetPartCount — this surfaces
  // remaining qty when a worker started a batch with fewer parts than the SWO target.
  const getActualAllocated = (mainWoId: string): number => {
    const subWos = (subOrdersMap[mainWoId] || []).filter((o: any) => o.type === 'SUB');
    return subWos.reduce((total: number, subWo: any) => {
      const subWoId = String(subWo._id || subWo.id);
      const subStage = stages.find(s => String(s.workOrderId?._id || s.workOrderId) === subWoId);
      if (subStage && subStage.status !== ProcessStageStatus.PENDING) {
        const assignedQty = (subStage.machineAssignments || []).reduce(
          (s: number, ma: any) => s + (ma.targetQuantity || ma.qty || 0), 0
        );
        return total + (assignedQty > 0 ? assignedQty : subWo.targetPartCount || 0);
      }
      return total + (subWo.targetPartCount || 0);
    }, 0);
  };

  const renderAssignmentManager = (isSubModal = false) => {
    const data = isSubModal ? subFormData : formData;
    const setter = isSubModal ? setSubFormData : setFormData;
    const assignments = data.machineAssignments || [];

    const addAssignment = () => {
      setter((prev: any) => ({
        ...prev,
        machineAssignments: [...(prev.machineAssignments || []), { machineId: '', targetQuantity: 0, operatorId: '', programNumber: '' }]
      }));
    };

    const removeAssignment = (index: number) => {
      setter((prev: any) => {
        const next = [...(prev.machineAssignments || [])];
        next.splice(index, 1);
        return { ...prev, machineAssignments: next };
      });
    };

    const updateAssignment = (index: number, field: string, value: any) => {
      setter((prev: any) => {
        const next = [...(prev.machineAssignments || [])];
        next[index] = { ...next[index], [field]: value };
        return { ...prev, machineAssignments: next };
      });
    };

    const processType = isSubModal ? data.processType : data.initialStage;

    const totalAllocated = assignments.reduce((s: number, a: any) => s + (a.targetQuantity || 0), 0);
    const targetQty = data.targetPartCount || 0;
    const remaining = targetQty - totalAllocated;
    const allocColor = totalAllocated > targetQty ? '#dc2626' : totalAllocated === targetQty ? '#16a34a' : '#d97706';
    const allocBg = totalAllocated > targetQty ? '#fee2e2' : totalAllocated === targetQty ? '#dcfce7' : '#fef3c7';

    return (
      <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: '#d7e6e4', paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#183f3c' }}>{isPdcManager ? 'PDC Diecasting Assignments' : 'Machine Assignments'}</Text>
            {!isSubModal && remaining > 0 && assignments.length > 0 && (
              <Text style={{ fontSize: 11, color: '#d97706', fontWeight: '600' }}>
                Remaining {remaining} pcs can be added later via + SWO
              </Text>
            )}
            {!isSubModal && assignments.length === 0 && (
              <Text style={{ fontSize: 11, color: '#5b7773' }}>Optional — skip to allocate all via + SWO after saving</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {assignments.length > 0 && (
              <View style={{ backgroundColor: allocBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: allocColor }}>
                  {totalAllocated} / {targetQty} pcs
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={{ backgroundColor: '#00877f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
              onPress={addAssignment}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>+ Add Assignment</Text>
            </TouchableOpacity>
          </View>
        </View>

        {assignments.length === 0 ? (
          <View style={{ padding: 20, backgroundColor: '#f7fbfa', borderRadius: 8, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#c8dbd8' }}>
            <Text style={{ fontSize: 12, color: '#5b7773' }}>No assignments yet — Target: {data.targetPartCount || 0} pcs</Text>
          </View>
        ) : (
          assignments.map((ma: any, idx: number) => (
            <View key={idx} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#d7e6e4' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                <View style={{ backgroundColor: '#d9f3f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#00877f' }}>ASSIGNMENT #{idx + 1}</Text>
                </View>
                <TouchableOpacity onPress={() => removeAssignment(idx)}>
                  <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 10 }}>
                {isPdcManager ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <FormField label="PDC Diecasting User" style={{ flex: 1 }}>
                      <Select
                        placeholder="Select User"
                        value={(() => {
                          const found = pdcUsers.find(u => u.id === ma.operatorId || (u as any)._id === ma.operatorId || u.name === ma.operatorId);
                          return found ? (found.id || (found as any)._id) : ma.operatorId;
                        })()}
                        options={pdcUsers
                          .filter(isPdcDiecastingUser)
                          .map(u => ({ label: u.name, value: u.id || (u as any)._id }))}
                        onSelect={v => updateAssignment(idx, 'operatorId', v)}
                      />
                    </FormField>
                    <FormField label="Qty" style={{ width: 120 }}>
                      <TextInput
                        style={inputStyle.input}
                        placeholder="0"
                        keyboardType="numeric"
                        value={String(ma.targetQuantity || '')}
                        onChangeText={t => updateAssignment(idx, 'targetQuantity', parseInt(t) || 0)}
                      />
                    </FormField>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <FormField label="Machine" style={{ flex: 1 }}>
                        <Select
                          placeholder="Select Machine"
                          value={ma.machineId}
                          options={machines.filter(m => !processType || m.type === processType).map(m => ({ label: m.name, value: m.machineId }))}
                          onSelect={v => updateAssignment(idx, 'machineId', v)}
                        />
                      </FormField>
                      <FormField label="Target Qty" style={{ width: 120 }}>
                        <TextInput
                          style={inputStyle.input}
                          placeholder="0"
                          keyboardType="numeric"
                          value={String(ma.targetQuantity || '')}
                          onChangeText={t => updateAssignment(idx, 'targetQuantity', parseInt(t) || 0)}
                        />
                      </FormField>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <FormField label="Operator" style={{ flex: 1 }}>
                        <Select
                          placeholder="Select Operator"
                          value={ma.operatorId}
                          options={operators.filter(o => o.process === 'ALL' || !processType || o.process === processType).map(o => ({ label: o.name, value: o.name }))}
                          onSelect={v => updateAssignment(idx, 'operatorId', v)}
                        />
                      </FormField>
                      <FormField label="Program #" style={{ flex: 1 }}>
                        <TextInput
                          style={inputStyle.input}
                          placeholder="PRG-001"
                          value={ma.programNumber || ''}
                          onChangeText={t => updateAssignment(idx, 'programNumber', t)}
                        />
                      </FormField>
                    </View>
                    {isSubModal && (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <FormField label="Start Date *" style={{ flex: 1 }}>
                          <DatePicker
                            value={ma.startDate || ''}
                            minDate={today}
                            onChange={(d) => updateAssignment(idx, 'startDate', d)}
                          />
                        </FormField>
                        <FormField label="End Date" style={{ flex: 1 }}>
                          <DatePicker
                            value={ma.endDate || ''}
                            minDate={ma.startDate || today}
                            onChange={(d) => updateAssignment(idx, 'endDate', d)}
                          />
                        </FormField>
                      </View>
                    )}
                  </>
                )}
              </View>
            </View>
          ))
        )}

        {assignments.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, padding: 8, backgroundColor: assignments.reduce((acc: number, curr: any) => acc + (curr.targetQuantity || 0), 0) !== (data.targetPartCount || 0) ? '#fff1f2' : '#f0fdf4', borderRadius: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: assignments.reduce((acc: number, curr: any) => acc + (curr.targetQuantity || 0), 0) !== (data.targetPartCount || 0) ? '#e11d48' : '#166534' }}>
              {assignments.reduce((acc: number, curr: any) => acc + (curr.targetQuantity || 0), 0) === (data.targetPartCount || 0)
                ? `✓ Target Reached: ${data.targetPartCount} / ${data.targetPartCount}`
                : `⚠️ Total Assigned: ${assignments.reduce((acc: number, curr: any) => acc + (curr.targetQuantity || 0), 0)} / ${data.targetPartCount || 0}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const totalCount = orders.length;
  const pendingApprovalCount = orders.filter(o => o.status === WorkOrderStatus.PENDING_APPROVAL).length;
  const pendingCount = orders.filter(o => o.status === WorkOrderStatus.NOT_STARTED).length;
  const activeCount = orders.filter(o => o.status === WorkOrderStatus.IN_PROGRESS).length;
  const completedCount = orders.filter(o => o.status === WorkOrderStatus.COMPLETED).length;

  const getEffectiveStatus = (wo: WorkOrder): WorkOrderStatus => {
    const id = String((wo as any)._id || wo.id);
    const children = subOrdersMap[id] || [];

    // If the work order itself is marked COMPLETED, trust it.
    if (wo.status === WorkOrderStatus.COMPLETED) return WorkOrderStatus.COMPLETED;

    // If it has children, derive status from them
    if (children.length > 0) {
      const childrenStatuses = children.map(c => getEffectiveStatus(c));

      const allCompleted = childrenStatuses.every(s => s === WorkOrderStatus.COMPLETED);
      if (allCompleted) return WorkOrderStatus.COMPLETED;

      const anyStarted = childrenStatuses.some(s => s !== WorkOrderStatus.NOT_STARTED);
      if (anyStarted) return WorkOrderStatus.IN_PROGRESS;
    }

    return wo.status;
  };

  const getVisibleChildren = (wo: WorkOrder) => {
    const id = String((wo as any)._id || wo.id);
    const humanId = wo.workOrderId ? String(wo.workOrderId) : null;

    let children = [...(subOrdersMap[id] || [])];
    if (humanId && subOrdersMap[humanId]) {
      subOrdersMap[humanId].forEach(child => {
        if (!children.some(c => String(c._id || c.id) === String(child._id || child.id))) {
          children.push(child);
        }
      });
    }

    const isTechnician = (isPdcDiecasting || isPdcCoating || isPdcMachining) && !isSuperAdmin && !isPdcManager;
    if (isTechnician && children.length > 0) {
      children = children.filter(c => {
        const uId = String(currentUser?.id || '').trim().toLowerCase();
        const u_Id = String(currentUser?._id || '').trim().toLowerCase();
        const uName = String(currentUser?.name || '').trim().toLowerCase();
        const uUser = String(currentUser?.username || '').trim().toLowerCase();
        const uEmail = String(currentUser?.email || '').trim().toLowerCase();

        const rawOp = c.operatorId as any;
        let opId = '';
        let opName = '';

        if (rawOp && typeof rawOp === 'object') {
          opId = String(rawOp.id || rawOp._id || '').trim().toLowerCase();
          opName = String(rawOp.name || '').trim().toLowerCase();
        } else {
          opId = String(rawOp || '').trim().toLowerCase();
        }

        const checkMatch = (op: any) => {
          if (!op) return false;

          let oId = '';
          let oName = '';
          if (typeof op === 'object') {
            oId = String(op.id || op._id || '').trim().toLowerCase();
            oName = String(op.name || '').trim().toLowerCase();
          } else {
            oId = String(op || '').trim().toLowerCase();
          }

          const tokens = [uId, u_Id, uName, uUser, uEmail].filter(t => !!t);
          if (tokens.some(t => oId === t)) return true;

          const normOId = oId.replace(/[\s_]+/g, '');
          const normOName = oName.replace(/[\s_]+/g, '');

          for (const token of tokens) {
            const normToken = token.replace(/[\s_]+/g, '');
            if (!normToken) continue;
            if (normOId.includes(normToken) || normToken.includes(normOId)) return true;
            if (normOName && (normOName.includes(normToken) || normToken.includes(normOName))) return true;
          }

          return false;
        };

        const isAssignedTopLevel = checkMatch(c.operatorId);
        const isAssignedInMachines = (c.machineAssignments || []).some((ma: any) => checkMatch(ma.operatorId));
        const subOrderId = String(c._id || c.id);

        const orderStages = stages
          .filter(s => String(s.workOrderId?._id || s.workOrderId) === subOrderId)
          .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

        const activeStage = orderStages.length > 0 ? orderStages[orderStages.length - 1] : null;

        const isAssignedInStages = orderStages.some(s => checkMatch(s.operatorId));

        const isExplicitlyAssigned = isAssignedTopLevel || isAssignedInMachines || isAssignedInStages;

        // Check if the current state of the order is "unassigned" but belongs to the user's role
        let isRoleMatchForUnassigned = false;

        if (activeStage) {
          // It's in progress/routed. Look at the active stage.
          const stageOp = String(activeStage.operatorId || '').trim().toLowerCase();
          const stageHasNoOp = !stageOp || stageOp === 'null' || stageOp === 'undefined' || stageOp === 'none' || stageOp === '';

          if (stageHasNoOp) {
            if (isPdcDiecasting && activeStage.type === 'DIE_CASTING') isRoleMatchForUnassigned = true;
            if (isPdcCoating && activeStage.type === 'COATING') isRoleMatchForUnassigned = true;
            if (isPdcMachining && activeStage.type === 'MACHINING') isRoleMatchForUnassigned = true;
          }
        } else {
          // Not started yet. Look at the top-level assignment.
          const opIdStr = String(c.operatorId || '').trim().toLowerCase();
          const topLevelHasNoOp = !opIdStr || opIdStr === 'null' || opIdStr === 'undefined' || opIdStr === 'none' || opIdStr === '';

          if (topLevelHasNoOp) {
            const pType = c.processType || c.initialStage || 'DIE_CASTING';
            if (isPdcDiecasting && pType === 'DIE_CASTING') isRoleMatchForUnassigned = true;
            if (isPdcCoating && pType === 'COATING') isRoleMatchForUnassigned = true;
            if (isPdcMachining && pType === 'MACHINING') isRoleMatchForUnassigned = true;
          }
        }

        return isExplicitlyAssigned || isRoleMatchForUnassigned;
      });
    }
    return children;
  };

  // Must be defined after getEffectiveStatus and getVisibleChildren to avoid temporal dead zone
  // const filteredMainOrders = mainOrders.filter(o => {
  //   if (statusFilter === 'all') return true;
  //   return getEffectiveStatus(o) === (statusFilter as WorkOrderStatus);
  // });

  const filteredMainOrders = mainOrders.filter(o => {
    if (statusFilter === 'all') return true;

    // Check if any visible child matches the status filter.
    const visibleChildren = getVisibleChildren(o);
    if (visibleChildren.length > 0) {
      return visibleChildren.some(c => getEffectiveStatus(c) === statusFilter);
    }

    return getEffectiveStatus(o) === (statusFilter as WorkOrderStatus);
  });

  const renderRow = (wo: WorkOrder, level = 0) => {
    const id = String((wo as any)._id || wo.id);
    const effectiveStatus = getEffectiveStatus(wo);
    const isExpanded = expandedIds.has(id);

    const children = getVisibleChildren(wo);
    const isSub = level > 0;

    const woStageForDisplay = stages.find((s: any) => String(s.workOrderId?._id || s.workOrderId) === id);
    const stageAssignments = ((woStageForDisplay?.machineAssignments || []) as any[]);
    const displayAssignments = (wo.machineAssignments || []).length > 0 ? (wo.machineAssignments as any[]) : stageAssignments;
    const hasAssignments = displayAssignments.length > 0;

    const isMain = level === 0;
    const isRework = wo.type === 'REWORK';

    // Choose the inner row style based on hierarchy level
    const innerRowStyle = isMain
      ? styles.mainRow
      : isRework
        ? [styles.childRow, styles.reworkChildRow, { paddingLeft: level * 28 }]
        : [styles.childRow, styles.subChildRow, { paddingLeft: level * 28 }];

    const rowNode = (
      <React.Fragment>
        <View style={innerRowStyle as any}>
          <View style={[styles.cell, { width: 50, alignItems: 'center' }]}>
            {((children.length > 0) || (isSub && hasAssignments)) && (
              <TouchableOpacity onPress={() => toggleExpand(id)}>
                <Text style={{ fontSize: 18, color: '#00877f' }}>{isExpanded ? '▼' : '▶'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.cell, { width: 140 }]}>
            <Text style={styles.woId}>{wo.workOrderId || id.slice(-6)}</Text>
            {wo.type === 'REWORK' && (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2, borderWidth: 1, borderColor: '#fde68a' }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rework</Text>
              </View>
            )}
            {isSub && wo.type !== 'REWORK' && <Text style={styles.subLabel}>{wo.processType?.replace(/_/g, ' ')}</Text>}
            {wo.type === 'REWORK' && <Text style={styles.subLabel}>{wo.processType?.replace(/_/g, ' ')}</Text>}
          </View>
          <View style={[styles.cell, { width: 120, alignItems: 'center' }]}>
            <StatusBadge variant={effectiveStatus} />
          </View>
          <View style={[styles.cell, { flex: 1 }]}>
            <Text style={styles.partText}>{wo.partId}</Text>
            {isSub && wo.shift && (
              <Text style={{ fontSize: 11, color: '#5b7773' }}>Shift: {wo.shift}</Text>
            )}
          </View>
          <View style={[styles.cell, { width: 100, alignItems: 'center' }]}>
            {(() => {
              // For IN_PROGRESS child SWOs, show the actual machineAssignment total so the
              // worker sees the real qty in production, not the original (possibly larger) targetPartCount.
              let displayQty = wo.targetPartCount || 0;
              if (isSub) {
                const subStage = stages.find((s: any) =>
                  String(s.workOrderId?._id || s.workOrderId) === id &&
                  s.status !== ProcessStageStatus.PENDING
                );
                if (subStage) {
                  const actual = ((subStage.machineAssignments || []) as any[]).reduce(
                    (sum: number, ma: any) => sum + (ma.targetQuantity || ma.qty || 0), 0
                  );
                  if (actual > 0) displayQty = actual;
                }
              }
              return <Text style={styles.numericCell}>{displayQty}</Text>;
            })()}
            {isMain && (() => {
              const allotted = getActualAllocated(id);
              const remaining = (wo.targetPartCount || 0) - allotted;
              return remaining > 0 ? (
                <Text style={{ fontSize: 9, color: '#d97706', fontWeight: '700' }}>Rem: {remaining}</Text>
              ) : (
                <Text style={{ fontSize: 9, color: '#16a34a', fontWeight: '700' }}>Allotted ✓</Text>
              );
            })()}
          </View>
          <View style={[styles.cell, { width: 180, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}>
            {(isSub || wo.type === 'SUB' || isMain) && (isPdcDiecasting || isPdcCoating || isPdcMachining || isSuperAdmin || isPdcManager) && (
              (() => {
                const woId = String(wo._id || wo.id);
                const woStages = stages.filter(s => String(s.workOrderId?._id || s.workOrderId) === woId);

                // Find if ANY stage is active
                const ongoingStage = woStages.find(s => [ProcessStageStatus.IN_PROGRESS, ProcessStageStatus.READY_FOR_QI, ProcessStageStatus.QI_SUBMITTED].includes(s.status));
                const verifiedStage = woStages.find(s => s.status === ProcessStageStatus.PDC_VERIFIED);

                if (ongoingStage) {
                  if (ongoingStage.status === ProcessStageStatus.READY_FOR_QI) {
                    return (
                      <View style={[styles.btnAction, { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' }]}>
                        <Text style={[styles.btnActionText, { color: '#b45309' }]}>Ready for QI</Text>
                      </View>
                    );
                  }
                  const ongoingUserProc = (currentUser as any).process;
                  const userMatchesOngoingStage = isSuperAdmin || isPdcManager || (
                    ongoingUserProc
                      ? (ongoingUserProc === ongoingStage.type || ongoingUserProc === 'ALL')
                      : userRole.includes((ongoingStage.type || '').toLowerCase().replace(/_/g, ''))
                  );
                  if (ongoingStage.status === ProcessStageStatus.IN_PROGRESS && userMatchesOngoingStage) {
                    return (
                      <TouchableOpacity
                        style={[styles.btnAction, { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' }]}
                        onPress={() => handleSignalQI(ongoingStage)}
                      >
                        <Text style={[styles.btnActionText, { color: '#006b65' }]}>Send to QI</Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <View style={[styles.btnAction, { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' }]}>
                      <Text style={[styles.btnActionText, { color: '#006b65' }]}>In Progress</Text>
                    </View>
                  );
                }

                if (verifiedStage && woStages.every(s => s.status !== ProcessStageStatus.PENDING)) {
                  return (
                    <View style={[styles.btnAction, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
                      <Text style={[styles.btnActionText, { color: '#166534' }]}>Verified</Text>
                    </View>
                  );
                }

                // REWORK orders must be started from the Pipeline tab (full modal with material reconciliation).
                if (isRework) return null;

                const pendingStage = woStages.find(s => s.status === ProcessStageStatus.PENDING);
                const isMainWoForStart = wo.type === 'MAIN' || (!wo.type && !(wo as any).parentWorkOrderId);
                const allocatedForStart = isMainWoForStart ? getActualAllocated(id) : 0;
                // MAIN WO: show Start only when remaining qty > 0 (creates a new batch SWO)
                // Child SUB WO: show Start so worker can start a PDC-Manager-assigned batch
                const hasRemainingQty = !isMainWoForStart || allocatedForStart < (wo.targetPartCount || 0);
                const assignedOperators = [
                  wo.operatorId,
                  ...((wo.machineAssignments || []) as any[]).map(ma => ma.operatorId),
                  ...stageAssignments.map(ma => ma.operatorId),
                  ...woStages.map(s => s.operatorId)
                ].filter(Boolean);
                const isAssignedToCurrentUser = assignedOperators.some(operatorMatchesCurrentUser);

                // Check that the user's process role matches the pending stage type
                const stageTypeForStart = pendingStage?.type || '';
                const userProcField = (currentUser as any).process;
                const userMatchesPendingStage = isSuperAdmin || isPdcManager || (
                  userProcField
                    ? (userProcField === stageTypeForStart || userProcField === 'ALL')
                    : userRole.includes(stageTypeForStart.toLowerCase().replace(/_/g, ''))
                );

                if ((effectiveStatus === WorkOrderStatus.NOT_STARTED || pendingStage) && isAssignedToCurrentUser && hasRemainingQty && userMatchesPendingStage) {
                  return (
                    <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#16a34a' }]} onPress={() => handleStartWork(wo)}>
                      <Text style={[styles.btnActionText, { color: '#fff' }]}>Start</Text>
                    </TouchableOpacity>
                  );
                }

                return null;
              })()
            )}

            {isMain && isPdcManager && !hasAnyChildStarted(id) && (() => {
              const allotted = getActualAllocated(id);
              const remaining = (wo.targetPartCount || 0) - allotted;
              if (remaining <= 0) return null;
              return (
                <TouchableOpacity
                  style={[styles.btnAction, { backgroundColor: '#ede9fe' }]}
                  onPress={() => { loadHelpers(); openAddSub(wo); }}
                >
                  <Text style={[styles.btnActionText, { color: '#7c3aed' }]}>+ SWO</Text>
                </TouchableOpacity>
              );
            })()}

            {!isSub && (
              <TouchableOpacity
                style={[styles.btnAction, { backgroundColor: '#e8f8f6' }]}
                onPress={() => {
                  setSelectedWoForProgress(wo);
                  setShowProgressModal(true);
                }}
              >
                <Text style={[styles.btnActionText, { color: '#006b65' }]}>View Details</Text>
              </TouchableOpacity>
            )}

            {(isSuperAdmin || isPdcManager) && !hasProductionStarted(wo) && !(isPdcManager && isMain && hasAnyChildStarted(id)) && (
              <TouchableOpacity
                style={[styles.btnAction, { backgroundColor: '#edf5f4' }]}
                onPress={async () => {
                  setLoading(true);
                  try {
                    const fullWo = await DataStorage.getWorkOrderById(id);
                    if (fullWo) {
                      const editMasterId = (fullWo as any).masterId || (fullWo as any).materialId || '';
                      const formatted = {
                        ...fullWo,
                        startDate: (fullWo as any).startDate ? new Date((fullWo as any).startDate).toISOString().split('T')[0] : '',
                        endDate: (fullWo as any).endDate ? new Date((fullWo as any).endDate).toISOString().split('T')[0] : '',
                        acceptancePoints: (fullWo as any).acceptancePoints || [],
                        machineAssignments: (fullWo as any).machineAssignments || [],
                        shifts: (fullWo as any).shifts || [],
                        processType: (fullWo as any).processType || (fullWo as any).initialStage || 'DIE_CASTING',
                        initialStage: (fullWo as any).processType || (fullWo as any).initialStage || 'DIE_CASTING',
                        masterId: editMasterId,
                        materialGrade: (fullWo as any).materialGrade || (fullWo as any).grade || '',
                        batchNumber: (fullWo as any).batchNumber || '',
                      };

                      // Set form data and open modal immediately (no await between these)
                      setFormData(formatted as any);
                      setShowModal(true);

                      // Restore batch details in background (non-blocking)
                      if (editMasterId) {
                        DataStorage.getBatchDetails(editMasterId).then(details => {
                          if (details) {
                            const stock = details.availableStockKg ?? (details as any).totalAvailableKg ?? 0;
                            setActiveBatchDetails({ ...details, availableStockKg: stock });
                          }
                        }).catch(() => {});
                      }
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <Text style={[styles.btnActionText, { color: '#486966' }]}>Edit</Text>
              </TouchableOpacity>
            )}

            {!isTenantAdmin && (isSuperAdmin || isPdcManager) && !hasProductionStarted(wo) && !(isPdcManager && isMain && hasAnyChildStarted(id)) && wo.status !== WorkOrderStatus.COMPLETED && (
              <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#fee2e2' }]} onPress={() => handleDelete(id)}>
                <Text style={[styles.btnActionText, { color: '#ef4444' }]}>Del</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* SWO Machine Assignment Breakdown */}
        {isSub && isExpanded && hasAssignments && (
          <View style={{ backgroundColor: '#f0f9ff', padding: 12, marginLeft: (level * 24) + 50, borderLeftWidth: 2, borderLeftColor: '#00877f', marginBottom: 6, borderRadius: 8, marginRight: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#00877f', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>🛠 Machine-wise Production Assignment</Text>
            {displayAssignments.map((ma: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: i < (displayAssignments.length - 1) ? 1 : 0, borderBottomColor: '#d9f3f0' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e3a5f' }}>{ma.machineId}</Text>
                  <Text style={{ fontSize: 11, color: '#5b7773' }}>Operator: <Text style={{ color: '#315451', fontWeight: '600' }}>{
                    (() => {
                      if (!ma.operatorId) return 'Default';
                      const u = pdcUsers.find((p: any) => String(p._id || p.id) === String(ma.operatorId) || p.name === ma.operatorId);
                      return u ? u.name : ma.operatorId;
                    })()
                  }</Text></Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#00877f' }}>{ma.targetQuantity} pcs</Text>
                  <Text style={{ fontSize: 11, color: '#5b7773' }}>Prog: <Text style={{ color: '#315451', fontWeight: '600' }}>{ma.programId || ma.programNumber || 'Standard'}</Text></Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {isExpanded && children.map(sub => renderRow(sub, level + 1))}
      </React.Fragment>
    );

    if (isMain) {
      return (
        <View key={id} style={styles.groupCard}>
          {rowNode}
        </View>
      );
    }
    return <React.Fragment key={id}>{rowNode}</React.Fragment>;
  };

  const getAllDescendantIds = (rootId: string) => {
    const ids = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of orders) {
        const oId = String(o._id || o.id);
        const parentId = String(o.parentWorkOrderId || '');
        if (ids.has(parentId) && !ids.has(oId)) {
          ids.add(oId);
          changed = true;
        }
      }
    }
    return Array.from(ids);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
      >
        <View style={styles.maxWidth}>
          <PageHeader
            title="Production Work Orders"
            subtitle="Hierarchical view of manufacturing plans"
            actionLabel={canCreate ? "+ Create Main Order" : undefined}
            onAction={canCreate ? async () => {
              await loadHelpers();
              const nextIdStr = (orders.filter(o => o.type === 'MAIN').length + 1).toString().padStart(3, '0');

              const firstProcess = allProcesses[0]?.processId || 'DIE_CASTING';

              setFormData({
                type: 'MAIN',
                workOrderId: `WO-${nextIdStr}`,
                shifts: [],
                targetPartCount: 0,
                requiredQuantityKg: 0,
                initialStage: firstProcess,
                processType: firstProcess,
                machineAssignments: []
              });
              setShowModal(true);
            } : undefined}
          />

          <View style={styles.statRow}>
            {[
              { label: 'Total Main', value: filteredMainOrders.length, color: '#00877f', bg: '#d9f3f0' },
              { label: 'Active', value: activeCount, color: '#d97706', bg: '#fef3c7' },
              { label: 'Completed', value: completedCount, color: '#16a34a', bg: '#dcfce7' },
            ].map((s) => (
              <View key={s.label} style={[styles.statBox, { backgroundColor: s.bg }]}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.filterRow}>
            {(['all', WorkOrderStatus.NOT_STARTED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.COMPLETED] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, statusFilter === f && styles.filterBtnActive]}
                onPress={() => {
                  setStatusFilter(f);
                  setWoPage(1);
                }}
              >
                <Text style={[styles.filterBtnText, statusFilter === f && styles.filterBtnTextActive]}>
                  {f === 'all' ? 'All Main Orders' : f.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Hierarchical Table Header */}
          <View style={styles.tableHeader}>
            <View style={[styles.headerCell, { width: 50 }]} />
            <View style={[styles.headerCell, { width: 140 }]}><Text style={styles.headerText}>Order ID</Text></View>
            <View style={[styles.headerCell, { width: 120, alignItems: 'center' }]}><Text style={styles.headerText}>Status</Text></View>
            <View style={[styles.headerCell, { flex: 1 }]}><Text style={styles.headerText}>Part Identification</Text></View>
            <View style={[styles.headerCell, { width: 100, alignItems: 'center' }]}><Text style={styles.headerText}>Target</Text></View>
            <View style={[styles.headerCell, { width: 180, alignItems: 'center' }]}><Text style={styles.headerText}>Actions</Text></View>
          </View>

          {filteredMainOrders.length === 0 ? (
            <View style={styles.emptyBox}><Text>No work orders found.</Text></View>
          ) : (
            <>
              {filteredMainOrders.slice((woPage - 1) * WO_PAGE_SIZE, woPage * WO_PAGE_SIZE).map(o => renderRow(o))}

              {/* Pagination bar */}
              {filteredMainOrders.length > WO_PAGE_SIZE && (() => {
                const totalPages = Math.ceil(filteredMainOrders.length / WO_PAGE_SIZE);
                const pages: number[] = [];
                const start = Math.max(1, woPage - 2);
                const end = Math.min(totalPages, start + 4);
                for (let i = start; i <= end; i++) pages.push(i);
                return (
                  <View style={styles.paginationBar}>
                    <Text style={styles.paginationInfo}>
                      {`Showing ${(woPage - 1) * WO_PAGE_SIZE + 1}–${Math.min(woPage * WO_PAGE_SIZE, filteredMainOrders.length)} of ${filteredMainOrders.length}`}
                    </Text>
                    <View style={styles.paginationBtns}>
                      <TouchableOpacity
                        style={[styles.pageBtn, woPage === 1 && styles.pageBtnDisabled]}
                        onPress={() => setWoPage(p => Math.max(1, p - 1))}
                        disabled={woPage === 1}
                      >
                        <Text style={styles.pageBtnText}>‹</Text>
                      </TouchableOpacity>
                      {pages.map(p => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.pageBtn, p === woPage && styles.pageBtnActive]}
                          onPress={() => setWoPage(p)}
                        >
                          <Text style={[styles.pageBtnText, p === woPage && styles.pageBtnTextActive]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.pageBtn, woPage === totalPages && styles.pageBtnDisabled]}
                        onPress={() => setWoPage(p => Math.min(totalPages, p + 1))}
                        disabled={woPage === totalPages}
                      >
                        <Text style={styles.pageBtnText}>›</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Modals (Outside ScrollView for Web Compatibility) ────────────── */}

      {/* 0. Production Progress & History Modal */}
      <FormModal
        visible={showProgressModal}
        title="Production Progress & History"
        subtitle={`Detailed tracking for ${selectedWoForProgress?.workOrderId}`}
        onClose={() => setShowProgressModal(false)}
        saveLabel="Close"
        onSave={() => setShowProgressModal(false)}
        maxWidth={900}
      >
        {selectedWoForProgress && (
          <View>
            {/* Top Summary Cards */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <View style={{ flex: 1, backgroundColor: '#f7fbfa', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#d7e6e4' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#5b7773', textTransform: 'uppercase' }}>Target Quantity</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#083d3a', marginTop: 4 }}>{selectedWoForProgress.targetPartCount}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#f0fdf4', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>Total Good Parts</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#166534', marginTop: 4 }}>
                  {(() => {
                    const mainId = String(selectedWoForProgress._id || selectedWoForProgress.id);
                    const relatedIds = getAllDescendantIds(mainId);
                    return stages.filter(s => relatedIds.includes(String(s.workOrderId?._id || s.workOrderId))).reduce((sum, s) => sum + (s.goodPartsCount || 0), 0);
                  })()}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fffbeb', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#fde68a' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' }}>Remaining Target</Text>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#b45309', marginTop: 4 }}>{getWORemainingQty(selectedWoForProgress)}</Text>
              </View>
            </View>

            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e3a5f', marginBottom: 12 }}>Production Journey Overview</Text>
            <View style={{ paddingVertical: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#d7e6e4', marginBottom: 20 }}>
              {(() => {
                const mainId = String(selectedWoForProgress._id || selectedWoForProgress.id);
                const relatedIds = getAllDescendantIds(mainId);
                const journeyStages = stages.filter(s => relatedIds.includes(String(s.workOrderId?._id || s.workOrderId)))
                  .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

                if (journeyStages.length === 0) return <Text style={{ color: '#7a9692', fontStyle: 'italic', textAlign: 'center' }}>No stages started yet.</Text>;

                return journeyStages.map((js, idx) => {
                  const wo = orders.find(o => String(o._id || o.id) === String(js.workOrderId?._id || js.workOrderId));
                  return (
                    <View key={js._id || js.id} style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: js.status === 'COMPLETED' ? '#22c55e' : '#00877f', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{idx + 1}</Text>
                        </View>
                        {idx < journeyStages.length - 1 && (
                          <View style={{ width: 2, flex: 1, backgroundColor: '#d7e6e4', marginVertical: -8 }} />
                        )}
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#f7fbfa', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#d7e6e4' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#183f3c' }}>{js.type.replace('_', ' ')}</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#00877f' }}>{wo?.workOrderId}</Text>
                            {(wo?.workOrderId || '').startsWith('RW-') && <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 4, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#d97706', fontWeight: 'bold' }}>REWORK CYCLE</Text></View>}
                            {wo?.type === 'SUB' && !(wo?.workOrderId || '').startsWith('RW-') && <View style={{ backgroundColor: '#d9f3f0', paddingHorizontal: 4, borderRadius: 4 }}><Text style={{ fontSize: 9, color: '#006b65', fontWeight: 'bold' }}>SUB-ORDER</Text></View>}
                          </View>
                          {!((wo?.type === 'MAIN' || !wo?.type) && js.status === 'PENDING' && !((js.goodPartsCount || 0) > 0 || (js.reworkPartsCount || 0) > 0 || (js.rejectedPartsCount || 0) > 0)) && (
                            <StatusBadge variant={(js.status || 'PENDING').toLowerCase()} />
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 6, backgroundColor: '#fff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#edf5f4' }}>
                          <View>
                            <Text style={{ fontSize: 10, color: '#7a9692', fontWeight: '600' }}>Input Target</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#315451' }}>{js.inputQuantity || 0}</Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '600' }}>Good Parts ✓</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#16a34a' }}>{js.goodPartsCount || 0}</Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 10, color: '#d97706', fontWeight: '600' }}>Rework ↩</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#d97706' }}>{js.reworkPartsCount || 0}</Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '600' }}>Rejected ✕</Text>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#dc2626' }}>{js.rejectedPartsCount || 0}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                });
              })()}
            </View>

            <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e3a5f', marginBottom: 12 }}>Detailed Submission History</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d7e6e4', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#f7fbfa', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d7e6e4' }}>
                <Text style={{ flex: 1.5, paddingLeft: 12, fontSize: 11, fontWeight: '800', color: '#5b7773' }}>DATE / STAGE</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>SUBMITTED</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>GOOD</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>REWORK</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>REJECTED</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>INV. RET.</Text>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: '#5b7773' }}>REMAINING</Text>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {(() => {
                  const mainId = String(selectedWoForProgress._id || selectedWoForProgress.id);
                  const relatedIds = getAllDescendantIds(mainId);
                  const relatedOrders = orders.filter(o => relatedIds.includes(String(o._id || o.id)));

                  // Gather all submissions from all related stages
                  const allSubmissions: any[] = [];
                  stages.filter(s => relatedIds.includes(String(s.workOrderId?._id || s.workOrderId))).forEach(stage => {
                    const stageSubs = (stage as any).submissions || [];
                    if (stageSubs.length > 0) {
                      stageSubs.forEach((sub: any, subIdx: number) => {
                        allSubmissions.push({
                          ...sub,
                          stageType: stage.type,
                          stageId: stage._id,
                          actualMaterialReceivedKg: (stage as any).actualMaterialReceivedKg,
                          excessMaterialReceivedKg: (stage as any).excessMaterialReceivedKg,
                          workOrderId: String(stage.workOrderId?._id || stage.workOrderId),
                          displayIdx: subIdx + 1
                        });
                      });
                    } else if (stage.goodPartsCount > 0 || stage.reworkPartsCount > 0 || stage.rejectedPartsCount > 0) {
                      // Fallback for legacy stages without submissions array
                      allSubmissions.push({
                        timestamp: stage.updatedAt || stage.createdAt,
                        goodPartsCount: stage.goodPartsCount,
                        reworkPartsCount: stage.reworkPartsCount,
                        rejectedPartsCount: stage.rejectedPartsCount,
                        outputQuantity: stage.outputQuantity,
                        isVerified: stage.status === 'PDC_VERIFIED' || stage.status === 'COMPLETED',
                        stageType: stage.type,
                        stageId: stage._id,
                        actualMaterialReceivedKg: (stage as any).actualMaterialReceivedKg,
                        excessMaterialReceivedKg: (stage as any).excessMaterialReceivedKg,
                        workOrderId: String(stage.workOrderId?._id || stage.workOrderId),
                        displayIdx: 1
                      });
                    }
                  });

                  // Sort by timestamp descending
                  allSubmissions.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

                  if (allSubmissions.length === 0) {
                    return <View style={{ padding: 20, alignItems: 'center' }}><Text style={{ color: '#7a9692', fontStyle: 'italic' }}>No submissions recorded yet.</Text></View>;
                  }

                  let cumulativeGood = 0;
                  const target = selectedWoForProgress.targetPartCount || 0;

                  return allSubmissions.map((sub, idx) => {
                    const wo = relatedOrders.find(o => String(o._id || o.id) === sub.workOrderId);
                    const totalSubmitted = sub.outputQuantity || (sub.goodPartsCount + sub.reworkPartsCount + sub.rejectedPartsCount);

                    // Logic for "Rework WO Created"
                    const hasReworkWo = orders.some(o => o.parentWorkOrderId === mainId && o.type === 'REWORK' && o.processType === sub.stageType);

                    // Logic for Remaining Qty (in context of history)
                    // We sum up all good parts from submissions *after* (or including) this one in chronological order?
                    // Actually, the user's table shows Remaining Qty decreasing.
                    // Let's calculate it based on the sorted list (since it's desc, we sum from the bottom)
                    const goodInThisAndPrior = allSubmissions.slice(idx).reduce((sum, s) => sum + (s.goodPartsCount || 0), 0);
                    const remaining = Math.max(0, target - goodInThisAndPrior);

                    return (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 12, borderBottomWidth: idx < allSubmissions.length - 1 ? 1 : 0, borderBottomColor: '#edf5f4', alignItems: 'center' }}>
                        <View style={{ flex: 1.5, paddingLeft: 12 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#083d3a' }}>{fmtDateTime(sub.timestamp)}</Text>
                          <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '600' }}>{sub.stageType.replace('_', ' ')} {wo?.type === 'REWORK' ? '(Rework)' : ''}</Text>
                          {sub.actualMaterialReceivedKg !== undefined && (
                            <Text style={{ fontSize: 9, color: '#b45309', fontWeight: '800', marginTop: 2 }}>⚖️ Recv: {sub.actualMaterialReceivedKg}kg | Exc: {sub.excessMaterialReceivedKg}kg</Text>
                          )}
                        </View>
                        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#315451' }}>{totalSubmitted}</Text>
                        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#16a34a' }}>{sub.goodPartsCount}</Text>
                        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#d97706' }}>{sub.reworkPartsCount}</Text>
                        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#dc2626' }}>{sub.rejectedPartsCount}</Text>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <View style={{ backgroundColor: sub.rejectedPartsCount > 0 ? (sub.isVerified ? '#dcfce7' : '#fff7ed') : '#edf5f4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: sub.rejectedPartsCount > 0 ? (sub.isVerified ? '#166534' : '#c2410c') : '#7a9692' }}>
                              {sub.rejectedPartsCount > 0 ? (sub.isVerified ? 'YES' : 'PENDING') : 'N/A'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#006b65' }}>{remaining}</Text>
                        </View>
                      </View>
                    );
                  });
                })()}
              </ScrollView>
            </View>

            {/* Inventory Note */}
            <View style={{ marginTop: 20, padding: 12, backgroundColor: '#fef2f2', borderRadius: 10, borderWidth: 1, borderColor: '#fecaca' }}>
              <Text style={{ fontSize: 12, color: '#991b1b', fontWeight: '700' }}>ℹ Inventory Return Policy</Text>
              <Text style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>Rejected parts are automatically returned to the main inventory batch ({selectedWoForProgress.masterId}) at a rate of {selectedWoForProgress.weightPerPart || 0} KG per part.</Text>
            </View>
          </View>
        )}
      </FormModal>

      {/* 1. Create Sub-Work Order Modal */}
      <FormModal
        visible={showSubModal}
        title="Create Sub-Work Order"
        subtitle={(() => {
          if (!parentForSub) return '';
          const parentId = String(parentForSub._id || parentForSub.id);
          const allotted = orders
            .filter(o => o.type === 'SUB' && (String(o.parentWorkOrderId) === parentId || String((o.parentWorkOrderId as any)?._id) === parentId))
            .reduce((s, o) => s + (o.targetPartCount || 0), 0);
          const remaining = (parentForSub.targetPartCount || 0) - allotted;
          return `${parentForSub.workOrderId} · Total: ${parentForSub.targetPartCount} | Allotted: ${allotted} | Remaining: ${remaining}`;
        })()}
        onClose={() => setShowSubModal(false)}
        onSave={handleSaveSub}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <FormField label="Process Category" containerStyle={{ flex: 1 }} required>
            <Select
              placeholder="Select Process"
              value={subFormData.processType}
              options={allProcesses.map(p => ({ label: p.processName, value: p.processId }))}
              onSelect={v => setSubFormData({ ...subFormData, processType: v })}
            />
          </FormField>
          <FormField label="Shift" containerStyle={{ flex: 1 }}>
            <Select
              placeholder="Select Shift"
              value={subFormData.shift}
              options={shifts.map(s => ({ label: s.name, value: s.name }))}
              onSelect={v => {
                const s = shifts.find(sh => sh.name === v);
                setSubFormData({ ...subFormData, shift: v, shiftId: s?._id || s?.id });
              }}
            />
          </FormField>
        </View>
        <FormField label="SWO Target Quantity *" required>
          <TextInput
            style={inputStyle.input}
            keyboardType="numeric"
            placeholder="0"
            value={String(subFormData.targetPartCount || '')}
            onChangeText={t => setSubFormData({ ...subFormData, targetPartCount: parseInt(t) || 0 })}
          />
          {parentForSub && (() => {
            const parentId = String(parentForSub._id || parentForSub.id);
            const allotted = orders
              .filter(o => o.type === 'SUB' && (String(o.parentWorkOrderId) === parentId || String((o.parentWorkOrderId as any)?._id) === parentId))
              .reduce((s, o) => s + (o.targetPartCount || 0), 0);
            const remaining = (parentForSub.targetPartCount || 0) - allotted;
            return (
              <Text style={{ fontSize: 11, color: remaining < (subFormData.targetPartCount || 0) ? '#dc2626' : '#5b7773', marginTop: 4 }}>
                Remaining capacity: {remaining} pcs
              </Text>
            );
          })()}
        </FormField>
        {(isSuperAdmin || isPdcManager) && renderAssignmentManager(true)}
      </FormModal>

      {/* 2. Create/Edit Main Work Order Modal */}
      <FormModal
        key={(formData as any)._id || formData.id || 'new-wo'}
        visible={showModal}
        title={`${(formData as any)._id || formData.id ? 'Edit' : 'Create'} Work Order`}
        subtitle="Fill in production details"
        onClose={resetModal}
        onSave={handleSave}
        saveLabel={`${(formData as any)._id || formData.id ? 'Update' : 'Create'} Work Order`}
      >
        <FormField label="Work Order ID">
          <View style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}>
            <Text style={{ color: '#00877f', fontWeight: '700' }}>
              {(() => {
                const nId = (orders.filter(o => o.type === 'MAIN').length + 1).toString().padStart(3, '0');
                return formData.workOrderId || (formData.id || (formData as any)._id
                  ? `WO-${String((formData as any)._id || formData.id).slice(-6).toUpperCase()}`
                  : `WO-${nId} (Auto-generated)`);
              })()}
            </Text>
          </View>
        </FormField>

        {/* Section 1: Planning */}
        <View style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#edf5f4' }}>
          {/* <Text style={{ fontSize: 14, fontWeight: '800', color: '#00877f', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 1. Order Planning</Text> */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <FormField label="Start Date *" containerStyle={{ flex: 1 }}>
              <DatePicker
                value={formData.startDate || ''}
                minDate={today}
                onChange={(dateStr) => setFormData({ ...formData, startDate: dateStr })}
              />
            </FormField>
            <FormField label="End Date *" containerStyle={{ flex: 1 }}>
              <DatePicker
                value={formData.endDate || ''}
                minDate={formData.startDate || today}
                onChange={(dateStr) => setFormData({ ...formData, endDate: dateStr })}
              />
            </FormField>
          </View>

          {(isSuperAdmin || isPdcManager || isPdcDiecasting) && (
            <FormField label="Initial Production Stage *" required>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.shiftPill, styles.shiftPillActive, { opacity: 1 }]}>
                  <Text style={styles.shiftPillTextActive}>
                    {(allProcesses[0]?.processName) || 'Die Casting'}
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: '#7a9692', fontStyle: 'italic' }}>Always starts from first process</Text>
              </View>
            </FormField>
          )}

          {isSuperAdmin && (
            <FormField label="Assign Shift(s)">
              <Select
                placeholder="Select Shifts"
                multiple
                valueArray={formData.shifts || []}
                options={shifts.map(s => ({ label: s.name, value: s.name }))}
                onSelectMultiple={(vals) => setFormData({ ...formData, shifts: vals })}
              />
            </FormField>
          )}

          {isSuperAdmin && (
            <FormField label="Assign PDC Technician">
              <Select
                placeholder="Select PDC User"
                value={formData.pdcManagerId || ''}
                options={pdcUsers
                  .filter(u => {
                    const role = (u.role || '').toLowerCase();
                    if (role.includes('manager')) return true; // Managers can do all
                    if (!formData.initialStage) return true;
                    // Normalize both to remove spaces and underscores for foolproof matching
                    const normalizedProcess = formData.initialStage.toLowerCase().replace(/[\s_]+/g, '');
                    const normalizedRole = role.replace(/[\s_]+/g, '');
                    return normalizedRole.includes(normalizedProcess);
                  })
                  .map(u => ({ label: u.name, value: u.id || (u as any)._id }))}
                onSelect={(val) => setFormData({ ...formData, pdcManagerId: val })}
              />
            </FormField>
          )}
        </View>

        {/* Section 2: Component Details */}
        <View style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#edf5f4' }}>
          {/* <Text style={{ fontSize: 14, fontWeight: '800', color: '#00877f', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>⚙️ 2. Component Details</Text> */}
          <FormField label="Select Schedule Entry / Part *" required>
            <Select
              placeholder="Select from Monthly Schedule"
              value={formData.scheduleId || ''}
              disabled={!!formData._id}
              options={schedules
                .filter(s => {
                  const scheduleId = s._id || s.id;

                  // If we are editing, we MUST show the currently linked schedule
                  if (formData.scheduleId === scheduleId) return true;

                  const remaining = getRemainingQty(scheduleId, s.requiredQuantity);
                  if (remaining <= 0) return false;

                  const hasActiveOrder = orders.some(o =>
                    String(o.scheduleId) === String(scheduleId) &&
                    o.status !== 'COMPLETED' &&
                    (o.type === 'MAIN' || !o.type)
                  );

                  return !hasActiveOrder;
                })
                .map(s => {
                  const scheduleId = s._id || s.id;
                  const remaining = getRemainingQty(scheduleId, s.requiredQuantity);
                  const dateStr = s.date ? fmtDate(s.date) : 'No Date';
                  return {
                    label: `${s.serialNumber || 'SCH'} | ${s.partId} - ${s.partName} | Date: ${dateStr} | Bal: ${remaining}`,
                    value: scheduleId
                  };
                })}
              onSelect={handleScheduleChange}
            />
          </FormField>

          {(isSuperAdmin || isPdcManager) && (
            <View style={{ marginTop: 10, marginBottom: 10 }}>
              <FormField label="Master ID">
                <TextInput
                  style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '700', color: '#006b65' }]}
                  editable={false}
                  value={getMasterIdDisplay()}
                />
              </FormField>

              <FormField label="Batch No">
                <TextInput
                  style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '700', color: '#059669' }]}
                  editable={false}
                  value={(formData as any).batchNumber || '—'}
                />
              </FormField>

              <FormField label="Grade">
                <TextInput
                  style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '700', color: '#006b65' }]}
                  editable={false}
                  value={formData.materialGrade || '—'}
                />
              </FormField>

              {activeBatchDetails && (
                <View style={{ marginTop: -8, marginBottom: 12, paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '700' }}>
                    {/* Stock Available: {activeBatchDetails.totalAvailableKg.toFixed(2)} KG */}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>



        {/* Section 3: Production Target */}
        <View style={{ marginBottom: 16 }}>
          {/* <Text style={{ fontSize: 14, fontWeight: '800', color: '#00877f', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>🎯 3. Production Target</Text> */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <FormField label="Target Quantity (Parts) *" containerStyle={{ flex: 1 }}>
              <TextInput
                style={[inputStyle.input, { backgroundColor: '#edf5f4', color: '#5b7773' }]}
                editable={false}
                value={formData.targetPartCount?.toString() || '0'}
              />
            </FormField>
            {isSuperAdmin && (
              <FormField label="Material Required (KG) *" containerStyle={{ flex: 1 }}>
                <TextInput
                  style={[inputStyle.input, { borderColor: '#00877f' }]}
                  keyboardType="numeric"
                  placeholder="0.00"
                  value={formData.requiredQuantityKg?.toString()}
                  onChangeText={(t) => setFormData({ ...formData, requiredQuantityKg: parseFloat(t) || 0 })}
                />
              </FormField>
            )}
          </View>

          {isSuperAdmin && (
            <FormField label="Buffer Material (KG)">
              <TextInput
                style={inputStyle.input}
                placeholder="0.00"
                keyboardType="numeric"
                value={formData.bufferKg?.toString()}
                onChangeText={(t) => setFormData({ ...formData, bufferKg: parseFloat(t) || 0 })}
              />
            </FormField>
          )}

          <FormField label="Quality Acceptance Points">
            <Select
              placeholder="Select acceptance criteria"
              multiple
              valueArray={formData.acceptancePoints || []}
              options={availableAcceptancePoints.map(ap => ({ label: ap.point, value: ap.point }))}
              onSelectMultiple={(vals) => setFormData(prev => ({ ...prev, acceptancePoints: vals }))}
            />
          </FormField>
        </View>


        {(isSuperAdmin || isPdcManager) && (
          <>

            {renderAssignmentManager(false)}
          </>
        )}

        {(formData.pricePerPart || 0) > 0 && (formData.targetPartCount || 0) > 0 && (
          <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#bbf7d0', marginTop: 12 }}>
            <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '700' }}>
              Total Order Value: ₹{((formData.targetPartCount || 0) * (formData.pricePerPart || 0)).toLocaleString()}
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 10, color: '#7a9692', marginTop: 12, textAlign: 'center' }}>
          AP:{formData.acceptancePoints?.length || 0} | MA:{formData.machineAssignments?.length || 0} | ID:{(formData as any)._id || formData.id || 'NEW'}
        </Text>
      </FormModal>

      {/* 3. Start Production Stage Modal */}
      <FormModal
        visible={showStartModal}
        title={`Start ${selectedStage?.type?.replace('_', ' ')} Process`}
        subtitle="Enter timing and machine details before starting"
        onClose={() => setShowStartModal(false)}
        onSave={handleStartSubmit}
        saveLabel={submitting ? "Starting..." : "Start Process"}
        saveDisabled={submitting}
        maxWidth={960}
      >
        {/* WO Reference Card */}
        {selectedStage && (selectedStage.workOrderId as any)?._id && (
          <View style={styles.woRefCard}>
            {(() => {
              const wo = selectedStage.workOrderId as any;
              const isReworkWo = wo?.type === 'REWORK';
              const reqKg = wo?.requiredQuantityKg || 0;
              const bufKg = wo?.bufferKg || 0;
              const totalReq = reqKg + bufKg;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
                  {[
                    { label: 'Part ID', val: wo?.partId, color: '#00877f' },
                    { label: 'Grade', val: wo?.materialGrade, color: '#083d3a' },
                    { label: isReworkWo ? 'Rework' : 'Target', val: `${extraDetails.targetPartCount || wo?.targetPartCount} pcs`, color: '#083d3a' },
                    ...(!isReworkWo && reqKg > 0 && !extraDetails.siblingAlreadyDeductedMaterial ? [{ label: 'Required', val: `${extraDetails.requiredQuantityKg || reqKg} kg`, color: '#083d3a' }] : []),
                    ...(!isReworkWo && bufKg > 0 && !extraDetails.siblingAlreadyDeductedMaterial ? [{ label: 'Buffer', val: `${bufKg} kg`, color: '#083d3a' }] : []),
                    ...(!isReworkWo && totalReq > 0 && !extraDetails.siblingAlreadyDeductedMaterial ? [{ label: 'Store Pickup', val: `${(extraDetails.requiredQuantityKg || 0) + (extraDetails.bufferKg || 0)} kg`, color: '#00877f', bold: true }] : []),
                  ].filter(f => f.val).map((f, i, arr) => (
                    <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '600', textTransform: 'uppercase', marginBottom: 1 }}>{f.label}</Text>
                        <Text style={{ fontSize: (f as any).bold ? 15 : 13, fontWeight: '800', color: f.color }}>{f.val}</Text>
                      </View>
                      {i < arr.length - 1 && <View style={{ width: 1, height: 28, backgroundColor: '#d7e6e4' }} />}
                    </View>
                  ))}
                </View>
              );
            })()}
          </View>
        )}

        {/* ── Material Already Received Banner (second batch) ───────────────── */}
        {extraDetails.siblingAlreadyDeductedMaterial && (
          <View style={{ backgroundColor: '#fef9c3', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#fde047' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#854d0e', marginBottom: 6 }}>📦 Material Already Received for This Order</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(extraDetails.siblingMaterialReceivedKg || 0) > 0 && (
                <View style={{ backgroundColor: '#fef08a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 9, color: '#713f12', fontWeight: '600', textTransform: 'uppercase' }}>Material Taken</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400e' }}>{extraDetails.siblingMaterialReceivedKg} kg</Text>
                </View>
              )}
              {(extraDetails.mainWoTargetCount || 0) > 0 && (
                <View style={{ backgroundColor: '#fef08a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 9, color: '#713f12', fontWeight: '600', textTransform: 'uppercase' }}>Full Order Qty</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400e' }}>{extraDetails.mainWoTargetCount} pcs</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, color: '#78350f', marginTop: 8 }}>
              Material for this batch is already covered — no additional material needed from store.
            </Text>
          </View>
        )}

        {/* ── First-batch context hint when order is being split ─────────────── */}
        {extraDetails.isFirstStage && (extraDetails.mainWoTargetCount || 0) > (extraDetails.targetPartCount || 0) && (
          <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#86efac' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#166534', marginBottom: 4 }}>📋 Batch Split Context</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Text style={{ fontSize: 11, color: '#14532d' }}>Full order: <Text style={{ fontWeight: '800' }}>{extraDetails.mainWoTargetCount} pcs</Text></Text>
              {(extraDetails.mainWoRequiredKg || 0) > 0 && (
                <Text style={{ fontSize: 11, color: '#14532d' }}>  |  Total material ~<Text style={{ fontWeight: '800' }}>{extraDetails.mainWoRequiredKg} kg</Text></Text>
              )}
              <Text style={{ fontSize: 11, color: '#14532d' }}>  |  This batch: <Text style={{ fontWeight: '800' }}>{extraDetails.targetPartCount} pcs</Text></Text>
            </View>
            <Text style={{ fontSize: 10, color: '#15803d', marginTop: 4 }}>Enter material received for this batch only. The remaining batch can be started separately.</Text>
          </View>
        )}

        {/* ── First Process: Initial Setup ─────────────────────────────────── */}
        {extraDetails.isFirstStage && (
          <View style={{ backgroundColor: '#f0f9ff', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#bae6fd' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#006b65', marginBottom: 8 }}>🏭 First Process: Initial Setup</Text>

            <View style={{ flexDirection: 'row', gap: 0, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#d7e6e4', backgroundColor: '#fff' }}>
              {[
                { label: 'Part Name', val: extraDetails.partName || 'N/A' },
                ...(!extraDetails.isRework ? [{ label: 'Master ID', val: extraDetails.masterId || 'N/A' }] : []),
                ...(!extraDetails.isRework && extraDetails.batchNumber ? [{ label: 'Batch No', val: extraDetails.batchNumber }] : []),
                ...(extraDetails.batchDate ? [{ label: 'Batch Date', val: fmtDate(extraDetails.batchDate) }] : []),
                ...(extraDetails.materialGrade ? [{ label: 'Grade', val: extraDetails.materialGrade }] : []),
              ].map((f, i, arr) => (
                <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 9, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 1 }}>{f.label}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#083d3a' }}>{f.val}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={{ width: 1, height: 28, backgroundColor: '#d7e6e4' }} />}
                </View>
              ))}
            </View>

            {/* Material Reconciliation moved inside each machine row for Die Casting */}
          </View>
        )}

        {!extraDetails.isRework && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 4, backgroundColor: extraDetails.isExternalVendor ? '#e8f8f6' : 'transparent', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: extraDetails.isExternalVendor ? '#00877f' : '#d7e6e4' }}
            onPress={() => setExtraDetails({ ...extraDetails, isExternalVendor: !extraDetails.isExternalVendor })}
          >
            <View style={{ width: 22, height: 22, borderWidth: 2, borderColor: '#006b65', borderRadius: 6, marginRight: 10, backgroundColor: extraDetails.isExternalVendor ? '#006b65' : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
              {extraDetails.isExternalVendor && <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>✓</Text>}
            </View>
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#006b65' }}>Mark as External / Vendor Production</Text>
              <Text style={{ fontSize: 11, color: '#5b7773', marginTop: 2 }}>Vendor will handle production and supply output quantity.</Text>
            </View>
          </TouchableOpacity>
        )}

        {!extraDetails.isRework && extraDetails.isExternalVendor && (
          <FormField label="Select Vendor *" required>
            <Select
              placeholder="Select Vendor"
              value={extraDetails.vendorName}
              options={vendors.map(v => ({
                label: `${v.vendorName || 'Unnamed'} | ${v.city || 'N/A'} | ${v.area || 'N/A'}`,
                value: v.vendorName
              }))}
              onSelect={(v) => setExtraDetails({ ...extraDetails, vendorName: v })}
            />
          </FormField>
        )}

        {/* ── Acceptance Points (from Work Order) ───────────────────────────── */}
        {(() => {
          const pts: string[] = (selectedStage?.workOrderId as any)?.acceptancePoints || [];
          if (pts.length === 0) return null;
          return (
            <View style={styles.acceptanceBox}>
              <Text style={styles.acceptanceTitle}>✅ Acceptance Points to Check</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {pts.map((pt, i) => (
                  <View key={i} style={styles.acceptancePill}>
                    <Text style={styles.acceptancePillText}>✓ {pt}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Target qty + planned dates summary row */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: (extraDetails.weightPerPart || 0) > 0 || (extraDetails.pricePerPart || 0) > 0 ? 8 : 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Target Quantity</Text>
            <View style={{ backgroundColor: '#edf5f4', borderRadius: 8, borderWidth: 1, borderColor: '#d7e6e4', padding: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#183f3c' }}>{extraDetails.targetPartCount || 0} pcs</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Planned Start</Text>
            <View style={{ backgroundColor: '#edf5f4', borderRadius: 8, borderWidth: 1, borderColor: '#d7e6e4', padding: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#315451' }}>
                {(() => {
                  const d = (selectedStage?.workOrderId as any)?.startDate || timingData.startDate;
                  return d ? fmtDate(d) : 'N/A';
                })()}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>Planned End</Text>
            <View style={{ backgroundColor: '#edf5f4', borderRadius: 8, borderWidth: 1, borderColor: '#d7e6e4', padding: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#315451' }}>
                {(() => {
                  const d = (selectedStage?.workOrderId as any)?.endDate || timingData.endDate;
                  return d ? fmtDate(d) : 'N/A';
                })()}
              </Text>
            </View>
          </View>
        </View>

        {/* Price / Weight info — shown once a program is selected (extraDetails updated by row 0) */}
        {((extraDetails.weightPerPart || 0) > 0 || (extraDetails.pricePerPart || 0) > 0) && (
          <View style={{ flexDirection: 'row', gap: 0, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#d7e6e4', backgroundColor: '#f7fbfa', marginBottom: 16 }}>
            {(extraDetails.weightPerPart || 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 9, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 1 }}>Weight / Part</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#083d3a' }}>{extraDetails.weightPerPart} kg</Text>
                </View>
                {(extraDetails.pricePerPart || 0) > 0 && <View style={{ width: 1, height: 28, backgroundColor: '#d7e6e4' }} />}
              </View>
            )}
            {(extraDetails.pricePerPart || 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ fontSize: 9, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 1 }}>Price / Part</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803d' }}>₹{extraDetails.pricePerPart}</Text>
                </View>
                {(extraDetails.targetPartCount || 0) > 0 && <View style={{ width: 1, height: 28, backgroundColor: '#d7e6e4' }} />}
              </View>
            )}
            {(extraDetails.pricePerPart || 0) > 0 && (extraDetails.targetPartCount || 0) > 0 && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ fontSize: 9, color: '#5b7773', fontWeight: '700', textTransform: 'uppercase', marginBottom: 1 }}>Total Order Value</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#15803d' }}>₹{((extraDetails.targetPartCount || 0) * (extraDetails.pricePerPart || 0)).toLocaleString()}</Text>
              </View>
            )}
          </View>
        )}

        {/* Machine assignments — multi-machine card layout */}
        {!extraDetails.isExternalVendor && (
          <View style={{ marginTop: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#183f3c' }}>Machine Assignments</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ backgroundColor: machineRows.reduce((s: number, r: any) => s + (r.targetQuantity || 0), 0) === (extraDetails.targetPartCount || 0) ? '#dcfce7' : '#fef3c7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: machineRows.reduce((s: number, r: any) => s + (r.targetQuantity || 0), 0) === (extraDetails.targetPartCount || 0) ? '#166534' : '#b45309' }}>
                    {machineRows.reduce((s: number, r: any) => s + (r.targetQuantity || 0), 0)} / {extraDetails.targetPartCount || 0} pcs
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#00877f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  onPress={addMachineRow}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>+ Add Row</Text>
                </TouchableOpacity>
              </View>
            </View>

            {
              stageMachines.length === 0 && (
                <Text style={{ fontSize: 11, color: '#7a9692', marginBottom: 8 }}>No {selectedStage?.type?.replace('_', ' ')} machines configured. Check Configuration.</Text>
              )
            }

            {
              machineRows.map((row: any, idx: number) => (
                <View key={idx} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#d7e6e4', overflow: 'hidden', marginBottom: 10 }}>
                  {/* Card header */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f7fbfa', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#d7e6e4' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: '#d9f3f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#00877f' }}>ROW #{idx + 1}</Text>
                      </View>
                      {row.machineId ? <Text style={{ fontSize: 11, color: '#5b7773', fontWeight: '600' }}>{row.machineId}</Text> : null}
                    </View>
                    {machineRows.length > 1 && (
                      <TouchableOpacity
                        onPress={() => removeMachineRow(idx)}
                        style={{ backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
                      >
                        <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>✕ Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ padding: 12 }}>
                    {/* Row A: Machine | Operator | Shift | Qty */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                      <FormField label="Machine *" style={{ flex: 2.5, minWidth: 0 }}>
                        <Select
                          placeholder="Select machine"
                          value={row.machineId}
                          options={stageMachines.map((m: any) => ({ label: `${m.name} (${m.machineId})`, value: m.machineId }))}
                          onSelect={(v) => {
                            const updated = [...machineRows];
                            updated[idx] = { ...updated[idx], machineId: v };
                            setMachineRows(updated);
                          }}
                        />
                      </FormField>
                      <FormField label="Operator *" style={{ flex: 2, minWidth: 0 }}>
                        <Select
                          placeholder="Select operator"
                          value={row.operatorId}
                          options={operatorOptions}
                          onSelect={(v) => {
                            const updated = [...machineRows];
                            updated[idx] = { ...updated[idx], operatorId: v };
                            setMachineRows(updated);
                          }}
                        />
                      </FormField>
                      <FormField label="Shift *" style={{ flex: 1.5, minWidth: 0 }}>
                        <Select
                          placeholder="Select shift"
                          value={row.shift}
                          options={shifts.map((s: any) => ({ label: s.name, value: s.name }))}
                          onSelect={(v) => {
                            const updated = [...machineRows];
                            updated[idx] = { ...updated[idx], shift: v };
                            setMachineRows(updated);
                          }}
                        />
                      </FormField>
                      <FormField label="Qty *" style={{ flex: 0.8, minWidth: 0 }}>
                        <TextInput
                          style={inputStyle.input}
                          placeholder="0"
                          keyboardType="numeric"
                          value={row.targetQuantity ? row.targetQuantity.toString() : ''}
                          onChangeText={(t) => {
                            const updated = [...machineRows];
                            const qty = parseInt(t) || 0;
                            updated[idx] = { ...updated[idx], targetQuantity: qty };
                            if (extraDetails.weightPerPart) {
                              updated[idx].requiredQuantityKg = +(qty * extraDetails.weightPerPart).toFixed(2);
                            }
                            setMachineRows(updated);
                          }}
                        />
                      </FormField>
                    </View>

                    {/* Row B: Program / Model | Start Date | End Date */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <FormField label="Program / Model *" style={{ flex: 2, minWidth: 0 }}>
                        <Select
                          placeholder="Select program"
                          value={row.programId}
                          options={programOptions}
                          onSelect={(v) => {
                            const programDetails = getProgramStartDetails(v);
                            const updated = [...machineRows];
                            updated[idx] = { ...updated[idx], ...programDetails, programId: v };
                            setMachineRows(updated);
                            if (idx === 0) {
                              setExtraDetails({
                                ...extraDetails,
                                programId: v,
                                totalCycleTimeSeconds: programDetails.totalCycleTimeSeconds,
                                selectPartType: programDetails.selectPartType,
                                partsType: programDetails.partsType,
                                partsPerCycle: programDetails.partsPerCycle,
                                weightPerPart: programDetails.weightPerPart ?? extraDetails.weightPerPart ?? 0,
                                pricePerPart: programDetails.pricePerPart ?? extraDetails.pricePerPart ?? 0,
                              });
                            }
                          }}
                        />
                      </FormField>
                      <FormField label="Start Date *" style={{ flex: 1.5, minWidth: 0 }}>
                        <DatePicker
                          value={row.startDate || today}
                          onChange={(d) => {
                            const updated = [...machineRows];
                            updated[idx] = { ...updated[idx], startDate: d };
                            setMachineRows(updated);
                          }}
                          minDate={today}
                        />
                      </FormField>
                    </View>

                    {/* Material Reconciliation — per machine row, Die Casting only */}
                    {(selectedStage?.type || '').toUpperCase() === 'DIE_CASTING' && !extraDetails.isRework && (() => {
                      const rowReqKg = parseFloat(((row.targetQuantity || 0) * (extraDetails.weightPerPart || 0)).toFixed(3));
                      const rowBufKg = parseFloat((rowReqKg * (extraDetails.bufferPercent || 0) / 100).toFixed(3));
                      const rowTotalReq = parseFloat((rowReqKg + rowBufKg).toFixed(3));
                      const rowExcess = parseFloat(((row.actualMaterialReceivedKg || 0) - rowTotalReq).toFixed(3));
                      return (
                        <View style={{ marginTop: 10, padding: 12, backgroundColor: '#fffbeb', borderRadius: 10, borderWidth: 1, borderColor: '#fde68a' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 }}>
                            <Text style={{ fontSize: 11 }}>⚖️</Text>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400e' }}>MATERIAL RECONCILIATION</Text>
                            <Text style={{ fontSize: 10, color: '#b45309', marginLeft: 4 }}>Required: {rowTotalReq} kg</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '700', marginBottom: 4 }}>ACTUAL RECEIVED (KG) *</Text>
                              <TextInput
                                style={{ backgroundColor: '#fff', borderWidth: 2, borderColor: '#fde047', borderRadius: 8, padding: 10, fontSize: 15, fontWeight: '800', color: '#183f3c' }}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                value={row.actualMaterialReceivedKg?.toString() || ''}
                                onChangeText={(t) => {
                                  const updated = [...machineRows];
                                  updated[idx] = { ...updated[idx], actualMaterialReceivedKg: parseFloat(t) || 0 };
                                  setMachineRows(updated);
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 10, color: '#5b7773', fontWeight: '700', marginBottom: 4 }}>CALCULATED EXCESS (KG)</Text>
                              <View style={{ backgroundColor: '#edf5f4', borderWidth: 1, borderColor: '#c8dbd8', borderRadius: 8, padding: 10 }}>
                                <Text style={{ fontSize: 15, fontWeight: '800', color: rowExcess < 0 ? '#dc2626' : '#183f3c' }}>
                                  {(row.actualMaterialReceivedKg || 0) > 0 ? rowExcess : '—'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      );
                    })()}

                    {/* End Date field removed */}
                  </View>
                </View>
              ))
            }
          </View >
        )
        }
      </FormModal >

      <FormModal
        visible={earlyEndPrompt.visible}
        title="Machine Already Assigned"
        subtitle="End the current process before starting this one"
        onClose={() => closeEarlyEndPrompt(null)}
        onSave={submitEarlyEndPrompt}
        saveLabel="End Process"
        saveDisabled={!earlyEndPrompt.reason.trim()}
        maxWidth={560}
        noScroll
      >
        <View style={{ gap: 12 }}>
          <Text style={{ color: '#315451', fontSize: 14, lineHeight: 21, fontWeight: '600' }}>
            {earlyEndPrompt.message}
          </Text>
          <FormField label="Reason to end" required>
            <TextInput
              style={[inputStyle.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={earlyEndPrompt.reason}
              onChangeText={(reason) => setEarlyEndPrompt(prev => ({ ...prev, reason }))}
              placeholder="Enter reason"
              multiline
            />
          </FormField>
        </View>
      </FormModal>
    </View >
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e8edf5' },
  maxWidth: { width: '100%', alignSelf: 'center' },
  readOnly: { backgroundColor: '#f7fbfa', justifyContent: 'center', borderColor: '#d7e6e4' },
  readOnlyText: { fontSize: 13, color: '#5b7773', fontWeight: '600' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  statBox: {
    flex: 1, minWidth: 100, borderRadius: 12, padding: 16,
    alignItems: 'center', marginHorizontal: 4, marginBottom: 8,
  },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '700' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  filterBtn: {
    borderWidth: 1, borderColor: '#c8dbd8', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8,
  },
  filterBtnActive: { backgroundColor: '#00877f', borderColor: '#00877f' },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: '#486966' },
  filterBtnTextActive: { color: '#ffffff' },
  woId: { fontSize: 13, fontWeight: '700', color: '#00877f', fontFamily: 'monospace' },
  numericCell: { fontSize: 13, fontWeight: '700', color: '#00877f' },
  btnAction: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4 },
  btnActionText: { fontSize: 12, fontWeight: '700' },
  viewOnly: { fontSize: 11, color: '#7a9692', paddingVertical: 5, fontStyle: 'italic' },
  shiftRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shiftPill: {
    borderWidth: 1, borderColor: '#c8dbd8', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#f7fbfa',
  },
  shiftPillActive: { backgroundColor: '#00877f', borderColor: '#00877f' },
  shiftPillText: { fontSize: 13, fontWeight: '600', color: '#486966' },
  shiftPillTextActive: { color: '#ffffff' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#083d3a',
    paddingVertical: 14,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginBottom: 4,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(15,23,42,0.25)' } as any,
    }),
  },
  headerCell: { paddingHorizontal: 12, justifyContent: 'center' },
  headerText: { color: '#f7fbfa', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  // ── Group card (wraps MAIN row + all its children) ───────────────────────
  groupCard: {
    marginBottom: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    ...Platform.select({
      ios: { shadowColor: '#183f3c', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 14 },
      android: { elevation: 6 },
      web: { boxShadow: '0 6px 20px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)' } as any,
    }),
  },
  // MAIN row inside the group card (no individual shadow, card provides it)
  mainRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
  },
  // Flat child row base (SUB + REWORK share this)
  childRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#edf5f4',
  },
  subChildRow: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 5,
    borderLeftColor: '#00877f',
    borderTopColor: '#d9f3f0',
  },
  reworkChildRow: {
    backgroundColor: '#fffbeb',
    borderLeftWidth: 5,
    borderLeftColor: '#f59e0b',
    borderTopColor: '#fde68a',
  },
  // Keep these as aliases so any remaining references don't break
  customRow: { flexDirection: 'row', paddingVertical: 14, backgroundColor: '#fff', alignItems: 'center' },
  subRow: { backgroundColor: '#f0f7ff', borderLeftWidth: 5, borderLeftColor: '#00877f' },
  reworkRow: { backgroundColor: '#fffbeb', borderLeftWidth: 5, borderLeftColor: '#f59e0b' },
  cell: { paddingHorizontal: 12, justifyContent: 'center' },
  subLabel: { fontSize: 10, color: '#5b7773', fontWeight: '700', marginTop: 2 },
  partText: { fontSize: 13, fontWeight: '600', color: '#315451' },
  emptyBox: { padding: 40, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12 },
  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    marginTop: 4,
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(15,23,42,0.06)' } as any,
    }),
  },
  paginationInfo: { fontSize: 12, color: '#5b7773', fontWeight: '600' },
  paginationBtns: { flexDirection: 'row', gap: 4 },
  pageBtn: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d7e6e4', backgroundColor: '#ffffff' },
  pageBtnActive: { backgroundColor: '#00877f', borderColor: '#00877f' },
  pageBtnDisabled: { opacity: 0.35 },
  pageBtnText: { fontSize: 13, fontWeight: '700', color: '#486966' },
  pageBtnTextActive: { color: '#ffffff' },
  woRefCard: { backgroundColor: '#f7fbfa', padding: 12, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#00877f', marginBottom: 16 },
  woRefTitle: { fontSize: 15, fontWeight: '800', color: '#00877f', textTransform: 'uppercase', marginBottom: 4 },
  acceptanceBox: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#22c55e' },
  acceptanceTitle: { fontSize: 11, fontWeight: '800', color: '#15803d', textTransform: 'uppercase', marginBottom: 4 },
  acceptancePill: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15 },
  acceptancePillText: { fontSize: 11, fontWeight: '700', color: '#166534' },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#edf5f4', alignItems: 'center', borderWidth: 1, borderColor: '#d7e6e4' },
  modeBtnActive: { backgroundColor: '#00877f', borderColor: '#00877f' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#5b7773' },
  modeBtnTextActive: { color: '#ffffff' },
});
