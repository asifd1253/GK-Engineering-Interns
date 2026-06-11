import React, { useEffect, useState, useMemo } from "react";
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
} from "react-native";
import { DataStorage, fmtDate, fmtDateTime } from "../utils/storage";
import {
  PageHeader,
  DataTable,
  Column,
  StatusBadge,
  FormModal,
  FormField,
  inputStyle,
  Select,
  DatePicker,
} from "../components";
import { ProcessStage, User, Machine, ProcessStageStatus } from "../types";
import { useToast } from "../context";

interface MachineRow {
  machineId: string;
  targetQuantity: number;
  operatorId: string;
  programId: string;
  startDate: string;
  endDate: string;
  shift: string;
  totalCycleTimeSeconds?: number;
  selectPartType?: string;
  partsType?: string;
  partsPerCycle?: number;
  pricePerPart?: number;
  actualMaterialReceivedKg?: number;
}

export function ProductionProcessScreen() {
  const [logs, setLogs] = useState<ProcessStage[]>([]);
  const [activeTab, setActiveTab] = useState("DIE_CASTING");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allProcesses, setAllProcesses] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);
  const [batches, setBatches] = useState<string[]>([]);

  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

  const role = (currentUser?.role || "").toLowerCase();
  const isAdminCheck = role.includes("admin");
  const isManager = role.includes("manager");
  const isPdcUser = role.includes("pdc");

  // QI modal
  const [showQiModal, setShowQiModal] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ProcessStage | null>(null);
  const [qiData, setQiData] = useState({
    goodPartsCount: 0,
    reworkPartsCount: 0,
    rejectedPartsCount: 0,
    scrapWeightKg: 0,
    lostWeightKg: 0,
    actualReceivedKg: 0,
    outputQuantity: 0,
    outputCount: 0,
    outputWeightKg: 0,
    rejectionReasons: [] as { reason: string; count: number }[],
    reworkReasons: [] as { reason: string; count: number }[],
    scrapReasons: [] as {
      reason: string;
      subReason?: string;
      availableSubReasons?: any[];
    }[],
    machineId: "",
    machineMappedQty: 0,
    isFirstSubmission: false,
    submissionDate: "",
  });

  // Start stage modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [timingData, setTimingData] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [stageMachines, setStageMachines] = useState<Machine[]>([]);
  const [primaryMachineId, setPrimaryMachineId] = useState("");
  const [machineRows, setMachineRows] = useState<MachineRow[]>([
    {
      machineId: "",
      targetQuantity: 0,
      operatorId: "",
      programId: "",
      startDate: "",
      endDate: "",
      shift: "",
    },
  ]);
  const useMultiMachine = true; // always multi-machine; kept as const for any legacy references
  const [vendors, setVendors] = useState<any[]>([]);
  const [partsMaster, setPartsMaster] = useState<any[]>([]);
  const [extraDetails, setExtraDetails] = useState<any>({});
  const [activeBatchDetails, setActiveBatchDetails] = useState<any>(null);
  const [acceptancePointOptions, setAcceptancePointOptions] = useState<any[]>(
    [],
  );
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [operatorOptions, setOperatorOptions] = useState<any[]>([]);
  const [programOptions, setProgramOptions] = useState<any[]>([]);
  const [rawPrograms, setRawPrograms] = useState<any[]>([]);

  const getProgramStartDetails = (programCode?: string) => {
    const prog = rawPrograms.find(
      (p: any) => p.programCode === programCode || p.programId === programCode,
    );
    const stageType = String(selectedStage?.type || "").toUpperCase();
    const processConfig =
      (prog?.process || []).find(
        (p: any) =>
          String(p.processId || "").toUpperCase() === stageType ||
          String(p.processName || "").toUpperCase() === stageType,
      ) ||
      prog?.process?.[0] ||
      {};

    return {
      programId: programCode || "",
      weightPerPart: prog?.weightPerPart,
      pricePerPart: prog?.pricePerPart,
      totalCycleTimeSeconds: Number(
        processConfig?.cycleTime?.totalCycleTimeSeconds ||
          processConfig?.totalCycleTimeSeconds ||
          0,
      ),
      selectPartType: processConfig?.selectPartType || "",
      partsType: processConfig?.selectPartType || "",
      partsPerCycle: Number(processConfig?.partsPerCycle || 0),
    };
  };

  // Route modal
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeyStages, setJourneyStages] = useState<ProcessStage[]>([]);
  const [nextType, setNextType] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [qualityReasons, setQualityReasons] = useState<any[]>([]);
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [receptionData, setReceptionData] = useState({ receivedQuantity: 0 });
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [stageToApprove, setStageToApprove] = useState<ProcessStage | null>(
    null,
  );
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab, statusFilter]);

  const loadData = async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [user, procs, sh, b, ap, vnds, schList, pts] = await Promise.all([
        DataStorage.getCurrentUser(),
        DataStorage.getProcesses(),
        DataStorage.getShifts(),
        DataStorage.getInventoryBatches(),
        DataStorage.getAcceptancePoints(),
        DataStorage.getVendors(),
        DataStorage.getMonthlySchedules(),
        DataStorage.getParts(),
      ]);
      setCurrentUser(user);
      setAllProcesses(
        procs.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)),
      );
      setShifts(sh);
      setBatches(b);
      setAcceptancePointOptions(ap || []);
      setVendors(vnds || []);
      setSchedules(schList || []);
      setPartsMaster(pts || []);
      setDataLoaded(true);

      const stages = await DataStorage.getProcessStages(
        activeTab === "OUTSOURCED" ? undefined : activeTab,
      );
      // Show all stages in the pipeline once the Work Order has been formally started.
      // We include MAIN, SUB, and REWORK types to show the full hierarchy.
      let filtered = stages.filter((s) => {
        const wo = s.workOrderId as any;
        if (!wo) return false;
        return wo.status !== "NOT_STARTED";
      });

      if (activeTab === "OUTSOURCED") {
        filtered = filtered.filter((s) => {
          const wo = s.workOrderId as any;
          return wo?.isExternalVendor || wo?.isOutsourced;
        });
      }

      setLogs(filtered);

      // Auto-expand all groups so action buttons (Verify Area, Route Forward, etc.) are always visible
      const parentIds = new Set<string>();
      filtered.forEach((s) => {
        const wo = s.workOrderId as any;
        if (!wo) return;
        const isMainWo = wo.type === "MAIN" || !wo.type;
        if (isMainWo) {
          const id = String(wo._id || "");
          if (id && id !== "undefined") parentIds.add(id);
        } else if (wo.type === "REWORK") {
          // REWORK's parent is SUB; traverse up to find the MAIN work order id
          const subWoId = String(wo.parentWorkOrderId || "");
          const subStage = filtered.find(
            (l) => String((l.workOrderId as any)?._id || "") === subWoId,
          );
          const mainId = subStage
            ? String((subStage.workOrderId as any)?.parentWorkOrderId || "")
            : "";
          const id = mainId || subWoId;
          if (id && id !== "undefined") parentIds.add(id);
        } else {
          const id = String(wo.parentWorkOrderId || "");
          if (id && id !== "undefined") parentIds.add(id);
        }
      });
      setExpandedOrders(parentIds);
    } catch (e) {
      showToast({ message: "Failed to fetch pipeline data.", type: "error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const displayLogs = useMemo(() => {
    const result: ProcessStage[] = [];

    // 1. Get all potential parent stages for context (unfiltered by status)
    const allMainStages = logs.filter((s) => {
      const wo = s.workOrderId as any;
      return wo?.type === "MAIN" || !wo?.type;
    });

    // 2. Filter logs for visibility: PTC users only see their assignments
    let userFilteredLogs = logs;
    if (isPdcUser && !isAdminCheck && !isManager) {
      userFilteredLogs = logs.filter((s) => {
        const wo = s.workOrderId as any;
        const isPopulated = wo && typeof wo === "object" && (wo._id || wo.id);

        // Identity strings for robust matching
        const currentUserId = String(currentUser?.id || currentUser?._id || "")
          .trim()
          .toLowerCase();
        const currentUserName = String(currentUser?.name || "")
          .trim()
          .toLowerCase();
        const stageOpId = String(s.operatorId || "")
          .trim()
          .toLowerCase();
        const woOpId = isPopulated
          ? String(wo.operatorId || "")
              .trim()
              .toLowerCase()
          : "";

        const isAssignedToMe =
          (currentUserId &&
            (stageOpId === currentUserId || woOpId === currentUserId)) ||
          (currentUserName &&
            (stageOpId === currentUserName || woOpId === currentUserName));

        // Determine Work Order Type
        const type = isPopulated ? String(wo.type || "").toUpperCase() : "";
        const isMain = type === "MAIN" || (isPopulated && !type);
        const isSub = type === "SUB" || type === "REWORK";

        // 1. MAIN orders are always visible to provide process context/headers
        if (isMain) return true;

        // 2. SUB orders/REWORKS are strictly filtered by assignment
        if (isSub) {
          // If the STAGE is explicitly assigned, strictly check that.
          if (stageOpId !== "") {
            return isAssignedToMe;
          }

          // Stage has no explicit operator.
          // Does the work order's top-level operator apply to this stage?
          const initialProcess = isPopulated
            ? String(
                wo.processType || wo.initialStage || "DIE_CASTING",
              ).toUpperCase()
            : "DIE_CASTING";
          const isInitialStage = s.type === initialProcess;

          if (isInitialStage && woOpId !== "") {
            return isAssignedToMe;
          }

          // It's an unassigned downstream stage (like Coating/Machining), or a completely unassigned initial stage. Show to all.
          return true;
        }

        // 3. Fallback: If data is not populated or type is unknown, filter by assignment
        const hasAssignmentFallback = stageOpId !== "";
        if (!hasAssignmentFallback) return true;
        return isAssignedToMe;
      });
    }

    // 3. Filter the active logs based on the user's status filter
    const activeFiltered =
      statusFilter === "all"
        ? userFilteredLogs
        : userFilteredLogs.filter((s) => s.status === statusFilter);

    // 3. Group these active logs by their Parent Work Order ID
    const groups: Record<string, ProcessStage[]> = {};
    activeFiltered.forEach((s) => {
      const wo = s.workOrderId as any;
      let parentId: string;
      if (wo?.type === "MAIN" || !wo?.type) {
        parentId = String(wo?._id || "");
      } else if (wo?.type === "REWORK") {
        // REWORK's direct parent is a SUB order. We group under the MAIN (grandparent).
        const subWoId = String(wo?.parentWorkOrderId || "");
        const subStage = logs.find(
          (l) => String((l.workOrderId as any)?._id || "") === subWoId,
        );
        const mainId = subStage
          ? String((subStage.workOrderId as any)?.parentWorkOrderId || "")
          : "";
        parentId = mainId || subWoId;
      } else {
        parentId = String(wo?.parentWorkOrderId || "");
      }

      if (!parentId || parentId === "undefined") {
        // Orphan stage (no parent info)
        result.push(s);
        return;
      }

      if (!groups[parentId]) groups[parentId] = [];
      groups[parentId].push(s);
    });

    // 4. Build the display list with Parents as headers, sorted by newest first
    const sortedParentIds = Object.keys(groups).sort((a, b) => {
      const groupA = groups[a];
      const groupB = groups[b];
      const dateA = Math.max(
        ...groupA.map((s) => new Date(s.createdAt || 0).getTime()),
      );
      const dateB = Math.max(
        ...groupB.map((s) => new Date(s.createdAt || 0).getTime()),
      );
      return dateB - dateA;
    });

    sortedParentIds.forEach((parentId) => {
      const groupStages = groups[parentId];
      // Find the MAIN stage for this group to use as a header
      const mainHeader = allMainStages.find(
        (m) => String((m.workOrderId as any)?._id || "") === parentId,
      );

      if (mainHeader) {
        const children = groupStages.filter((s) => s !== mainHeader);
        // If PTC user has no assigned children in this group, don't show the header either
        if (isPdcUser && !isAdminCheck && !isManager && children.length === 0)
          return;

        const hasChildren = children.length > 0;
        const allChildrenCompleted =
          hasChildren && children.every((s) => s.status === "COMPLETED");

        // If all sub-orders are completed/signed-off, show parent as COMPLETED
        const effectiveStatus = allChildrenCompleted
          ? "COMPLETED"
          : mainHeader.status;

        const enhancedMain = {
          ...mainHeader,
          effectiveStatus,
          _hasChildren: hasChildren, // helper for UI
        };

        result.push(enhancedMain);

        // If expanded, add all OTHER stages in this group (children)
        if (expandedOrders.has(parentId)) {
          // Sort children by creation date to keep flow logical (older first for sequence)
          const sortedChildren = [...children].sort(
            (a, b) =>
              new Date(a.createdAt || 0).getTime() -
              new Date(b.createdAt || 0).getTime(),
          );
          result.push(...sortedChildren);
        }
      } else {
        // No main header found in this tab, just list the children at root level
        result.push(...groupStages);
      }
    });

    return result;
  }, [logs, statusFilter, expandedOrders]);

  const toggleExpand = (woId: string) => {
    const next = new Set(expandedOrders);
    if (next.has(woId)) next.delete(woId);
    else next.add(woId);
    setExpandedOrders(next);
  };

  const onTabPress = (tab: string) => {
    if (activeTab === tab) loadData();
    else setActiveTab(tab);
  };

  // ---------- Start Stage ----------
  const openStartModal = async (stage: ProcessStage) => {
    setSelectedStage(stage);
    const today = new Date().toISOString().split("T")[0];
    setTimingData({
      startDate: today,
      startTime: "09:00",
      endDate: today,
      endTime: "18:00",
    });
    setPrimaryMachineId("");
    setMachineRows([
      {
        machineId: "",
        targetQuantity: 0,
        operatorId: currentUser?.name || "",
        programId: "",
        startDate: today,
        endDate: "",
        shift: "",
      },
    ]);

    // Check if we need to collect initial material details (Master ID, Grade, etc.)
    const wo = stage.workOrderId as any;
    const isRework = wo?.type === "REWORK";

    const firstProcessId = allProcesses[0]?.processId || "DIE_CASTING";

    const ptsMaster = await DataStorage.getParts();
    const woPartId = (wo?.partId || "").toString().trim().toLowerCase();
    const partInfo = ptsMaster.find(
      (p: any) => (p.partId || "").toString().trim().toLowerCase() === woPartId,
    );

    // Recover missing batch/date from schedule if needed
    let recoveredMasterId = wo.masterId || "";
    let recoveredBatchNumber = wo.batchNumber || "";
    let recoveredBatchDate = wo.batchDate || "";

    if (!recoveredMasterId && wo.scheduleId) {
      const sch = schedules.find((s) => (s._id || s.id) === wo.scheduleId);
      if (sch) {
        recoveredMasterId =
          (sch as any).batchNumber || (sch as any).batchId || "";
        recoveredBatchNumber = (sch as any).batchNumber || "";
        recoveredBatchDate =
          (sch as any).date || (sch as any).dateReceived || "";
      }
    }

    // For REWORK: inherit masterId + endDate from parent WO (the SWO it was created from)
    let reworkParentEndDate = "";
    if (isRework && wo.parentWorkOrderId) {
      try {
        const parentWo = await DataStorage.getWorkOrderById(
          String(wo.parentWorkOrderId),
        );
        if (parentWo) {
          if (!recoveredMasterId)
            recoveredMasterId = (parentWo as any).masterId || "";
          reworkParentEndDate = (parentWo as any).endDate
            ? new Date((parentWo as any).endDate).toISOString().split("T")[0]
            : "";
        }
      } catch (e) {}
    }

    const currentTarget = stage.inputQuantity || wo.targetPartCount || 0;
    const wpp =
      wo.weightPerPart ||
      partInfo?.weightPerPartKg ||
      partInfo?.weightPerPart ||
      0;
    const baseQty = currentTarget * wpp || 0;
    const bufferPercent = partInfo?.bufferPercent || 0;
    const bufferKg = (baseQty * bufferPercent) / 100;

    // For second/subsequent batches of the same MAIN WO, skip Material Reconciliation if
    // a sibling SWO already deducted material (isMaterialDeducted = true).
    let siblingAlreadyDeductedMaterial = false;
    let siblingMaterialReceivedKg = 0;
    let mainWoTargetCount = 0;
    let mainWoRequiredKg = 0;
    const mainWoId = String(
      wo?.parentWorkOrderId?._id || wo?.parentWorkOrderId || "",
    );
    if (mainWoId && wo?.type === "SUB" && !isRework) {
      try {
        const allWOs = await DataStorage.getWorkOrders();
        const siblings = allWOs.filter(
          (o: any) =>
            String(o.parentWorkOrderId?._id || o.parentWorkOrderId) ===
              mainWoId && String(o._id || o.id) !== String(wo._id || wo.id),
        );
        // Sum material already received by deducted siblings
        siblingMaterialReceivedKg = siblings
          .filter((o: any) => o.isMaterialDeducted)
          .reduce(
            (sum: number, o: any) => sum + (o.actualMaterialReceivedKg || 0),
            0,
          );
        // Get MAIN WO for full-order context
        const mainWo = allWOs.find(
          (o: any) => String(o._id || o.id) === mainWoId,
        );
        if (mainWo) {
          mainWoTargetCount = mainWo.targetPartCount || 0;
          const mwpp = mainWo.weightPerPart || wpp || 0;
          mainWoRequiredKg = Math.round(mainWoTargetCount * mwpp * 100) / 100;
        }
        // Skip reconciliation only if received material covers the full order (≥90%).
        // If only partial material was taken (e.g. for 100 out of 150), remaining batch still needs entry.
        siblingAlreadyDeductedMaterial =
          siblingMaterialReceivedKg > 0 && mainWoRequiredKg > 0
            ? siblingMaterialReceivedKg >= mainWoRequiredKg * 0.9
            : siblings.some((o: any) => o.isMaterialDeducted);
      } catch (e) {}
    }

    setExtraDetails({
      shift: "",
      operatorId: currentUser?.name || "",
      masterId: recoveredMasterId,
      batchNumber: recoveredBatchNumber,
      batchDate: recoveredBatchDate,
      materialGrade: wo.materialGrade || "",
      pricePerPart: wo.pricePerPart || 0,
      weightPerPart: wpp,
      targetPartCount: currentTarget,
      requiredQuantityKg: baseQty,
      bufferKg: bufferKg,
      bufferPercent: bufferPercent,
      isExternalVendor: wo.isExternalVendor || false,
      vendorName: wo.vendorName || "",
      acceptancePoints: wo.acceptancePoints || [],
      partName: wo.partName || partInfo?.partName || "N/A",
      // Skip Material Reconciliation if a sibling SWO already received and deducted material
      isFirstStage:
        !isRework &&
        !siblingAlreadyDeductedMaterial &&
        (stage.type || "").toUpperCase() ===
          (allProcesses[0]?.processId || "DIE_CASTING"),
      siblingAlreadyDeductedMaterial,
      siblingMaterialReceivedKg,
      mainWoTargetCount,
      mainWoRequiredKg,
      isRework: isRework,
      actualMaterialReceivedKg: 0,
      excessMaterialReceivedKg: 0,
      actualStartDate: wo.startDate
        ? new Date(wo.startDate).toISOString().split("T")[0]
        : "",
      actualEndDate: wo.endDate
        ? new Date(wo.endDate).toISOString().split("T")[0]
        : reworkParentEndDate,
      userStartDate: "",
      userEndDate: "",
    });

    if (wo.masterId) {
      const details = await DataStorage.getBatchDetails(wo.masterId);
      setActiveBatchDetails(details);
    }

    // Load machines filtered by stage type
    console.log(
      `[ProductionProcessScreen] Fetching machines for type: ${stage.type}`,
    );
    let machines = await DataStorage.getMachines(stage.type);
    console.log(
      `[ProductionProcessScreen] Fetched ${machines.length} machines from DB`,
    );

    // Fetch all active stages to find busy machines (calling without params fetches all types)
    const activeStages = await DataStorage.getProcessStages();
    const busyMachineIds = new Set<string>();

    (activeStages || []).forEach((s) => {
      // Treat any stage that isn't PENDING or COMPLETED as "occupying" the machine
      if (s.status !== "PENDING" && s.status !== "COMPLETED") {
        // 1. Check single machineId
        if (s.machineId) {
          if (typeof s.machineId === "string") {
            busyMachineIds.add(s.machineId.trim().toLowerCase());
          } else if (typeof s.machineId === "object") {
            const m = s.machineId as any;
            if (m.machineId)
              busyMachineIds.add(String(m.machineId).trim().toLowerCase());
            if (m._id) busyMachineIds.add(String(m._id).trim().toLowerCase());
          }
        }
        // 2. Check machineAssignments (multi-machine)
        if (s.machineAssignments && Array.isArray(s.machineAssignments)) {
          s.machineAssignments.forEach((m: any) => {
            if (m.machineId) {
              if (typeof m.machineId === "string") {
                busyMachineIds.add(m.machineId.trim().toLowerCase());
              } else if (typeof m.machineId === "object") {
                if (m.machineId.machineId)
                  busyMachineIds.add(
                    String(m.machineId.machineId).trim().toLowerCase(),
                  );
                if (m.machineId._id)
                  busyMachineIds.add(
                    String(m.machineId._id).trim().toLowerCase(),
                  );
              }
            }
          });
        }
      }
    });

    console.log(
      `[ProductionProcessScreen] Busy Machine IDs:`,
      Array.from(busyMachineIds),
    );

    setStageMachines(
      (machines || []).map((m) => {
        const code = String(m.machineId || "")
          .trim()
          .toLowerCase();
        const dbId = String(m._id || "")
          .trim()
          .toLowerCase();
        const isBusy = busyMachineIds.has(code) || busyMachineIds.has(dbId);
        return { ...m, isBusy };
      }),
    );

    // Load operators filtered by stage type
    let ops = await DataStorage.getOperators(stage.type);
    const opOpts = ops.map((o: any) => ({ label: o.name, value: o.name }));

    // Add current user if they are a PTC user and not already in the list
    if (currentUser) {
      const isPdc = (currentUser.role || "").toLowerCase().includes("pdc");
      if (isPdc) {
        opOpts.unshift({
          label: `${currentUser.name} (Current PDC)`,
          value: currentUser.name,
        });
      }
    }
    setOperatorOptions(opOpts);

    // Load programs filtered by stage type
    let progs = await DataStorage.getProgramMasters();
    setRawPrograms(progs || []);
    const processProgs = progs.filter(
      (p: any) =>
        p.processCategory === stage.type || p.processCategory === "ALL",
    );
    setProgramOptions(
      processProgs.map((p: any) => ({
        label: `${p.programName} (${p.programCode})`,
        value: p.programCode,
      })),
    );

    setShowStartModal(true);
  };

  const handleStart = async () => {
    if (!currentUser || !selectedStage?._id) return;

    const totalMachineQty = machineRows.reduce(
      (sum, r) => sum + (r.targetQuantity || 0),
      0,
    );

    // 1. Basic Mandatory Fields
    const isDieCasting =
      (selectedStage?.type || "").toUpperCase() ===
      (allProcesses[0]?.processId || "DIE_CASTING");

    if ((extraDetails.targetPartCount || 0) <= 0) {
      showToast({
        message: "Target Quantity is mandatory and must be > 0.",
        type: "warning",
      });
      return;
    }

    if (
      isDieCasting &&
      (!extraDetails.pricePerPart || Number(extraDetails.pricePerPart) <= 0)
    ) {
      showToast({
        message: "Price Per Part (₹) is mandatory for the Die Casting process.",
        type: "warning",
      });
      return;
    }

    // 2. Vendor vs In-House Validation
    if (extraDetails.isExternalVendor) {
      if (!extraDetails.vendorName) {
        showToast({
          message: "Vendor selection is mandatory for external production.",
          type: "warning",
        });
        return;
      }
    } else {
      // 3. Machine & Operator Validation (multi-machine only)
      if (isMultiMachineStage) {
        const isCoating =
          (selectedStage?.type || "").toUpperCase() === "COATING";
        if (extraDetails.isRework) {
          // No row-level validation for rework stages — machine section is hidden
        } else if (isCoating) {
          if (
            machineRows.some(
              (r) =>
                !r.operatorId ||
                !r.shift ||
                !r.startDate ||
                (r.targetQuantity || 0) <= 0,
            )
          ) {
            showToast({
              message:
                "Operator, Shift, Start Date, and Quantity are mandatory for all rows.",
              type: "warning",
            });
            return;
          }
        } else {
          if (
            machineRows.some(
              (r) =>
                !r.machineId ||
                !r.operatorId ||
                !r.shift ||
                !r.startDate ||
                (r.targetQuantity || 0) <= 0 ||
                !r.programId,
            )
          ) {
            showToast({
              message:
                "Machine, Operator, Shift, Program, Start Date, and Quantity are mandatory for all rows.",
              type: "warning",
            });
            return;
          }
        }
        if (totalMachineQty > extraDetails.targetPartCount) {
          showToast({
            message: `Total allocated (${totalMachineQty}) exceeds target quantity (${extraDetails.targetPartCount}).`,
            type: "warning",
          });
          return;
        }
      }
    }

    // 4. Inventory Check (First Stage)
    if (extraDetails.isFirstStage && !extraDetails.isExternalVendor) {
      if (!extraDetails.masterId) {
        showToast({
          message: "Batch No is missing. Cannot start production.",
          type: "error",
        });
        return;
      }
      const isDieCastingStart =
        (selectedStage?.type || "").toUpperCase() === "DIE_CASTING";
      if (isDieCastingStart) {
        const hasUnfilledRow = machineRows.some(
          (r) => !r.actualMaterialReceivedKg || r.actualMaterialReceivedKg <= 0,
        );
        if (hasUnfilledRow) {
          showToast({
            message:
              "Actual Received (KG) is mandatory for each machine in Die Casting.",
            type: "warning",
          });
          return;
        }
      }
      if (
        activeBatchDetails &&
        (activeBatchDetails.availableStockKg || 0) <
          (extraDetails.requiredQuantityKg || 0)
      ) {
        showToast({
          message: `Insufficient inventory. Available: ${activeBatchDetails.availableStockKg}kg, Required: ${extraDetails.requiredQuantityKg}kg.`,
          type: "error",
        });
        return;
      }
    }

    // Sum per-row actual received KG for the total used in inventory deduction
    const totalActualReceivedKg = machineRows.reduce(
      (sum, r) => sum + (r.actualMaterialReceivedKg || 0),
      0,
    );

    const payload = {
      plannedTiming: `${timingData.startTime} - ${timingData.endTime}`,
      machineId: primaryMachineId,
      machineAssignments: machineRows.map((r) => {
        const programDetails = getProgramStartDetails(
          r.programId || extraDetails.programId,
        );
        const startDate = r.startDate || timingData.startDate || today;
        return {
          ...r,
          ...programDetails,
          startDate,
          endDate: r.endDate || startDate,
          qty: r.targetQuantity,
          targetPartCount: r.targetQuantity,
          pricePerPart: Number(
            programDetails.pricePerPart ?? extraDetails.pricePerPart ?? 0,
          ),
          actualMaterialReceivedKg: r.actualMaterialReceivedKg || 0,
        };
      }),
      extraDetails: {
        ...extraDetails,
        selectPartType:
          extraDetails.selectPartType || extraDetails.partsType || "",
        // Use sum of all rows for total inventory deduction
        actualMaterialReceivedKg:
          totalActualReceivedKg || extraDetails.actualMaterialReceivedKg || 0,
      },
    };

    const wo = selectedStage.workOrderId as any;
    const target = extraDetails.targetPartCount || 0;
    const isSubWo = wo?.type === "SUB";
    const isPartialStart =
      !extraDetails.isExternalVendor &&
      isSubWo &&
      totalMachineQty > 0 &&
      totalMachineQty < target;

    // Track partial-start info for rollback if something fails after SWO creation
    let partialStartCleanup: {
      woId: string;
      originalTarget: number;
      newSwoId: string;
    } | null = null;

    setLoading(true);
    try {
      if (isPartialStart) {
        // Partial start on a SUB WO: split into a new SWO for this batch + keep original PENDING for remaining
        const woId = String(wo?._id || wo?.id || "");
        const mainWoId =
          String(wo?.parentWorkOrderId?._id || wo?.parentWorkOrderId || "") ||
          woId;
        const remaining = target - totalMachineQty;

        // Reduce original SWO's target to the remaining qty
        await DataStorage.updateWorkOrder(woId, { targetPartCount: remaining });

        // Create a new SWO for the submitted batch
        const allDates = machineRows
          .map((r) => [r.startDate, r.endDate])
          .flat()
          .filter(Boolean)
          .sort();
        const swoPayload = {
          type: "SUB" as const,
          parentWorkOrderId: mainWoId,
          partId: wo?.partId,
          processType: selectedStage?.type,
          startDate: allDates[0] || today,
          endDate: allDates[allDates.length - 1] || today,
          targetPartCount: totalMachineQty,
          machineAssignments: machineRows.map((r) => ({
            ...r,
            ...getProgramStartDetails(r.programId || extraDetails.programId),
            targetPartCount: r.targetQuantity,
          })),
          masterId: extraDetails.masterId,
          materialGrade: extraDetails.materialGrade,
          weightPerPart: extraDetails.weightPerPart,
          pricePerPart: extraDetails.pricePerPart,
          requiredQuantityKg:
            totalMachineQty * (extraDetails.weightPerPart || 0),
          scheduleId: wo?.scheduleId,
          operatorId: machineRows[0]?.operatorId,
          machineId: machineRows[0]?.machineId,
        };

        const swoResult = await DataStorage.createWorkOrder(swoPayload);
        if (!swoResult?.success) {
          await DataStorage.updateWorkOrder(woId, { targetPartCount: target });
          showToast({
            message:
              swoResult?.message || "Failed to create batch. Please try again.",
            type: "error",
          });
          return;
        }

        const newSwoId = String(
          swoResult.data?._id || swoResult.data?.id || "",
        );

        // Track for rollback — if startProcessStage fails we must undo steps above
        partialStartCleanup = { woId, originalTarget: target, newSwoId };

        // Find the new SWO's auto-created stage
        let swoStage: any = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          const allStages = await DataStorage.getProcessStages();
          swoStage = allStages.find(
            (s: any) =>
              String(s.workOrderId?._id || s.workOrderId) === newSwoId,
          );
          if (swoStage) break;
          await new Promise((r) => setTimeout(r, 500));
        }

        if (!swoStage?._id) {
          showToast({
            message: "Batch created. Refresh the Pipeline to start it.",
            type: "warning",
          });
          setShowStartModal(false);
          loadData();
          return;
        }

        const ok = await DataStorage.startProcessStage(
          swoStage._id,
          currentUser.id,
          payload.plannedTiming,
          payload.machineId,
          payload.machineAssignments,
          payload.extraDetails,
        );
        if (ok) {
          partialStartCleanup = null; // success — nothing to roll back
          setShowStartModal(false);
          loadData();
          showToast({
            message: `Started ${totalMachineQty} pcs. Remaining ${remaining} pcs appear as a separate batch — start them anytime.`,
            type: "success",
          });
        } else {
          // Roll back: restore original SWO target and delete the orphaned new SWO
          await DataStorage.updateWorkOrder(woId, { targetPartCount: target });
          await DataStorage.deleteWorkOrder(newSwoId);
          partialStartCleanup = null;
          showToast({
            message:
              "Machine is already allocated for this shift and date. Please select a different machine or shift.",
            type: "error",
          });
        }
      } else {
        // Full start or REWORK / external vendor: start stage directly
        const ok = await DataStorage.startProcessStage(
          selectedStage._id,
          currentUser.id,
          payload.plannedTiming,
          payload.machineId,
          payload.machineAssignments,
          payload.extraDetails,
        );
        if (ok) {
          setShowStartModal(false);
          loadData();
          showToast({
            message: "Production started successfully.",
            type: "success",
          });
        } else {
          showToast({ message: "Failed to start production.", type: "error" });
        }
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to start stage.",
        type: "error",
      });
      // Roll back partial start if the new SWO was already created before the error
      if (partialStartCleanup) {
        try {
          await DataStorage.updateWorkOrder(partialStartCleanup.woId, {
            targetPartCount: partialStartCleanup.originalTarget,
          });
          await DataStorage.deleteWorkOrder(partialStartCleanup.newSwoId);
        } catch (_) {}
        partialStartCleanup = null;
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------- Route ----------
  const handleRoute = async () => {
    if (!currentUser || !selectedStage?._id) return;

    const wo = selectedStage.workOrderId as any;
    const target = wo?.targetPartCount || 0;
    const woId = String(wo?._id || wo?.id || wo || "");

    // The UI already ensures total processed >= target before the button is available.
    // We route whatever Good Parts we achieved forward, and handle the remainder via new work orders or rework sub-orders.

    try {
      const ok = await DataStorage.managerRouteStage(
        selectedStage._id,
        nextType,
        false,
      );
      if (ok) {
        setShowRouteModal(false);
        loadData();
        const msg = nextType
          ? `✅ Good parts routed to ${nextType}.${(selectedStage?.reworkPartsCount ?? 0) > 0 ? "\n↩ Rework cycle auto-spawned for " + selectedStage?.reworkPartsCount + " parts." : ""}`
          : "🏁 Work Order completed!";
        showToast({ message: msg, type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Cannot route this stage.",
        type: "error",
      });
    }
  };
  const handleSignalQI = async (stage: ProcessStage) => {
    if (!currentUser) return;
    try {
      const ok = await DataStorage.signalProcessStageQI(
        stage._id!,
        currentUser.id,
      );
      if (ok) {
        showToast({
          message: "Production finished and signaled to QI.",
          type: "success",
        });
        loadData();
      }
    } catch (e: any) {
      showToast({
        message: "Failed to signal QI: " + e.message,
        type: "error",
      });
    }
  };

  const handleViewJourney = async (stage: ProcessStage) => {
    const wo = stage.workOrderId as any;
    const woId = String(wo?._id || wo?.id || wo || "");
    if (!woId) return;

    try {
      setLoading(true);
      const allStages = await DataStorage.getProcessStages("all");
      const journey = allStages
        .filter((s) => {
          const sWoId = String(
            s.workOrderId?._id || s.workOrderId?.id || s.workOrderId || "",
          );
          return sWoId === woId;
        })
        .sort(
          (a, b) =>
            new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime(),
        );

      setJourneyStages(journey);
      setSelectedStage(stage);
      setShowJourneyModal(true);
    } catch (e) {
      showToast({ message: "Failed to load journey.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleReceiveGoods = async () => {
    if (!selectedStage?._id) return;
    try {
      const ok = await DataStorage.startProcessStage(
        selectedStage._id,
        currentUser?.id || "",
        "Vendor Reception",
        "EXTERNAL_VENDOR",
        [],
        {
          receivedQuantity: receptionData.receivedQuantity,
          isOutsourced: true,
          receptionNote: "Goods received from vendor",
        },
      );
      if (ok) {
        setShowReceptionModal(false);
        loadData();
        showToast({
          message: "Goods received. Please proceed to Quality Inspection.",
          type: "success",
        });
      }
    } catch (e: any) {
      showToast({ message: "Reception failed: " + e.message, type: "error" });
    }
  };

  const handleOpenQiModal = async (stage: ProcessStage) => {
    setSelectedStage(stage);
    const wo = stage.workOrderId as any;
    const subs = stage.submissions || [];
    const prevSubmitted = subs.reduce(
      (sum, s) => sum + ((s.goodPartsCount || 0) + (s.rejectedPartsCount || 0)),
      0,
    );
    const initialQty = Math.max(0, (stage.inputQuantity || 0) - prevSubmitted);

    const woPartId = (wo?.partId || "").toString().trim().toLowerCase();
    const partInfo = partsMaster.find(
      (p) => (p.partId || "").toString().trim().toLowerCase() === woPartId,
    );
    const wpp = wo?.weightPerPart || partInfo?.weightPerPartKg || 0;
    const bufferPercent = partInfo?.bufferPercent || 0;
    const targetPartCount = wo?.targetPartCount || stage.inputQuantity || 0;

    // FIND ACTUAL RECEIVED WEIGHT (Robust fetch from all stages)
    let actualReceived = 0;
    try {
      const allStages = await DataStorage.getProcessStages();
      const woId = String(wo?._id || wo?.id || wo || "");
      const dieCastStage = allStages.find((l) => {
        const lWoId = String(
          (l.workOrderId as any)?._id ||
            (l.workOrderId as any)?.id ||
            l.workOrderId ||
            "",
        );
        return (
          lWoId === woId &&
          (l.type === "DIE_CASTING" || (l as any).processType === "DIE_CASTING")
        );
      });
      actualReceived = parseFloat(
        stage.extraDetails?.actualMaterialReceivedKg ||
          dieCastStage?.extraDetails?.actualMaterialReceivedKg ||
          wo?.actualMaterialReceivedKg ||
          "0",
      );
    } catch (e) {
      console.log("Error finding received weight:", e);
    }

    // Buffer logic: Apply FULL buffer (based on TOTAL target quantity) only if it's the first submission
    const isFirstSubmission =
      (stage.type === "DIE_CASTING" || stage.type === "COATING") &&
      !wo?.isBufferApplied &&
      subs.length === 0;
    const fullOrderBuffer = (targetPartCount * wpp * bufferPercent) / 100;
    const bufferTotal = isFirstSubmission ? wo?.bufferKg || fullOrderBuffer : 0;

    const baseWeight = initialQty * wpp;
    const initialWeight = parseFloat((baseWeight + bufferTotal).toFixed(3));

    const totalParts = initialQty; // rework/rejected are 0 initially
    const stageTypeUpper = (stage.type || "").toUpperCase();
    const bufferApplicable = !["COATING", "MACHINING"].includes(stageTypeUpper);
    const scrapApplicable = ["DIE_CASTING", "MACHINING"].includes(
      stageTypeUpper,
    );
    const outputWeight = parseFloat((targetPartCount * wpp).toFixed(3));
    const lostWeight = bufferApplicable
      ? parseFloat(((targetPartCount * wpp * bufferPercent) / 100).toFixed(3))
      : 0;
    const scrapWeight =
      scrapApplicable && actualReceived > 0
        ? parseFloat((actualReceived - outputWeight - lostWeight).toFixed(3))
        : 0;

    const isMultiMachine = (stage.machineAssignments || []).length > 1;

    setQiData({
      goodPartsCount: isMultiMachine ? 0 : initialQty,
      reworkPartsCount: 0,
      rejectedPartsCount: 0,
      scrapWeightKg:
        !isMultiMachine && isFirstSubmission && scrapApplicable
          ? Math.max(0, scrapWeight)
          : 0,
      lostWeightKg: isMultiMachine ? 0 : lostWeight,
      actualReceivedKg: actualReceived,
      outputQuantity: isMultiMachine ? 0 : initialQty,
      outputCount: isMultiMachine ? 0 : initialQty,
      outputWeightKg: isMultiMachine ? 0 : outputWeight,
      rejectionReasons: [],
      reworkReasons: [],
      scrapReasons: [],
      isFirstSubmission: isFirstSubmission,
      machineId: isMultiMachine ? "" : stage.machineId || "",
      machineMappedQty: 0,
      submissionDate: new Date().toISOString().split("T")[0],
    } as any);

    // Store actualReceived in a temporary way for onChange handlers if needed,
    // but we can just re-calculate it using the same logic or the state.
    (qiData as any)._actualReceived = actualReceived;

    // Load reasons for this process (using master list with fallbacks)
    // Load reasons with maximum robustness
    DataStorage.getReasons().then((reasons) => {
      const filtered = reasons.filter((r) => {
        const proc = (
          r.type ||
          r.processType ||
          r.processCategory ||
          r.stageType ||
          ""
        ).toUpperCase();
        // Return if it matches current process OR is a general reason (empty type)
        return (
          proc === stage.type ||
          proc === "" ||
          proc === "GENERAL" ||
          proc === "ALL"
        );
      });
      setQualityReasons(filtered);
    });

    setShowQiModal(true);
  };

  const handleQiMachineSelect = (machineId: string) => {
    if (!selectedStage) return;
    const assignment = (selectedStage.machineAssignments || []).find(
      (a: any) => a.machineId === machineId,
    );
    if (!assignment) return;
    const qty =
      assignment.qty ||
      assignment.targetQuantity ||
      assignment.targetPartCount ||
      0;
    const wo = selectedStage.workOrderId as any;
    const woPartId = (wo?.partId || "").toString().trim().toLowerCase();
    const partInfo = partsMaster.find(
      (p) => (p.partId || "").toString().trim().toLowerCase() === woPartId,
    );
    const wpp = wo?.weightPerPart || partInfo?.weightPerPartKg || 0;
    const bufferPercent = partInfo?.bufferPercent || 0;
    const qiStageType = (selectedStage?.type || "").toUpperCase();
    const qiBufferApplicable = !["COATING", "MACHINING"].includes(qiStageType);
    const qiScrapApplicable = ["DIE_CASTING", "MACHINING"].includes(
      qiStageType,
    );
    const outputWeight = parseFloat((qty * wpp).toFixed(3));
    const lostWeight = qiBufferApplicable
      ? parseFloat(((qty * wpp * bufferPercent) / 100).toFixed(3))
      : 0;
    // Use this machine's actual received KG (entered per-row at start time) for scrap calculation
    const machineActualKg = assignment.actualMaterialReceivedKg || 0;
    const scrapWeight =
      qiScrapApplicable && machineActualKg > 0
        ? parseFloat(
            Math.max(0, machineActualKg - outputWeight - lostWeight).toFixed(3),
          )
        : 0;
    setQiData((prev: any) => ({
      ...prev,
      machineId,
      machineMappedQty: qty,
      goodPartsCount: qty,
      reworkPartsCount: 0,
      rejectedPartsCount: 0,
      outputQuantity: qty,
      outputCount: qty,
      outputWeightKg: outputWeight,
      lostWeightKg: lostWeight,
      scrapWeightKg: scrapWeight,
      actualReceivedKg: machineActualKg,
      rejectionReasons: [],
      reworkReasons: [],
      scrapReasons: [],
    }));
  };

  const handleSubmitQI = async () => {
    if (!currentUser || !selectedStage?._id) return;

    const isMultiMachineStage =
      (selectedStage.machineAssignments || []).length > 1;
    const isCoatingStage =
      (selectedStage?.type || "").toUpperCase() === "COATING";
    if (isMultiMachineStage && !isCoatingStage && !qiData.machineId) {
      showToast({
        message: "Please select a machine before submitting QI.",
        type: "warning",
      });
      return;
    }

    const partsLimit =
      (qiData as any).machineMappedQty > 0
        ? (qiData as any).machineMappedQty
        : selectedStage.inputQuantity || 0;
    const totalParts =
      qiData.goodPartsCount +
      qiData.reworkPartsCount +
      qiData.rejectedPartsCount;
    if (totalParts > partsLimit) {
      showToast({
        message: `Sum of parts (${totalParts}) exceeds the ${(qiData as any).machineMappedQty > 0 ? "machine allocated" : "input"} quantity (${partsLimit}).`,
        type: "error",
      });
      return;
    }

    if (qiData.outputQuantity <= 0) {
      showToast({
        message: "Output Quantity is required and must be > 0.",
        type: "warning",
      });
      return;
    }
    if (qiData.outputCount <= 0) {
      // showToast({ message: 'Output Count (Shots) is required and must be > 0.', type: 'warning' });
      // return;
    }
    if (qiData.outputWeightKg <= 0) {
      showToast({
        message: "Output Weight (KG) is required and must be > 0.",
        type: "warning",
      });
      return;
    }

    // Rework reasons are optional — no mandatory validation

    // Mandatory rejection reasons
    if (qiData.rejectedPartsCount > 0) {
      const sum = qiData.rejectionReasons.reduce(
        (s, r) => s + (r.count || 0),
        0,
      );
      if (
        qiData.rejectionReasons.length === 0 ||
        sum !== qiData.rejectedPartsCount
      ) {
        showToast({
          message: `Rejection reasons must sum up to ${qiData.rejectedPartsCount} parts.`,
          type: "warning",
        });
        return;
      }
      if (qiData.rejectionReasons.some((r) => !r.reason)) {
        showToast({
          message: "Please select a reason for all rejection entries.",
          type: "warning",
        });
        return;
      }
    }

    // Mandatory scrap reason
    if (qiData.scrapWeightKg > 0 && qiData.scrapReasons.length === 0) {
      showToast({
        message: "Scrap reason is required when scrap weight > 0.",
        type: "warning",
      });
      return;
    }

    if (!(qiData as any).submissionDate) {
      showToast({ message: "Production date is required.", type: "warning" });
      return;
    }

    // Recalculate scrap at submit time using actual submitted qty (not pre-filled target qty)
    const submitStageType = (selectedStage?.type || "").toUpperCase();
    const isScrapStage = ["DIE_CASTING", "MACHINING"].includes(submitStageType);
    const submitWo = selectedStage?.workOrderId as any;
    const submitPartId = (submitWo?.partId || "")
      .toString()
      .trim()
      .toLowerCase();
    const submitPartInfo = partsMaster.find(
      (p: any) =>
        (p.partId || "").toString().trim().toLowerCase() === submitPartId,
    );
    const submitWpp =
      submitWo?.weightPerPart || submitPartInfo?.weightPerPartKg || 0;
    const submitBufPct = submitPartInfo?.bufferPercent || 0;
    const submittedQty =
      qiData.goodPartsCount +
      qiData.reworkPartsCount +
      qiData.rejectedPartsCount;
    const submitOutputWt = parseFloat((submittedQty * submitWpp).toFixed(3));
    const submitLostWt = parseFloat(
      ((submittedQty * submitWpp * submitBufPct) / 100).toFixed(3),
    );
    const submitActualRecv = (qiData as any).actualReceivedKg || 0;
    const computedScrap =
      isScrapStage && submitActualRecv > 0
        ? Math.max(
            0,
            parseFloat(
              (submitActualRecv - submitOutputWt - submitLostWt).toFixed(3),
            ),
          )
        : 0;

    const data = {
      goodPartsCount: qiData.goodPartsCount,
      reworkPartsCount: qiData.reworkPartsCount,
      rejectedPartsCount: qiData.rejectedPartsCount,
      scrapWeightKg: computedScrap,
      lostWeightKg: isScrapStage ? submitLostWt : 0,
      outputQuantity: qiData.outputQuantity,
      outputCount: qiData.outputCount,
      outputWeightKg: qiData.outputWeightKg,
      rejectionReasons: qiData.rejectionReasons,
      reworkReasons: qiData.reworkReasons,
      scrapReasons: qiData.scrapReasons.map((s: any) =>
        s.subReason ? `${s.reason}: ${s.subReason}` : s.reason,
      ),
      machineId: (qiData as any).machineId || undefined,
      // Pass weight details for inventory return of rejected parts
      weightPerPart: (selectedStage.workOrderId as any)?.weightPerPart || 0,
      batchNumber:
        (selectedStage.workOrderId as any)?.batchNumber ||
        (selectedStage.workOrderId as any)?.masterId,
      materialGrade: (selectedStage.workOrderId as any)?.materialGrade,
      submissionDate: (qiData as any).submissionDate,
    };

    try {
      const ok = await DataStorage.submitProcessStageQI(
        selectedStage._id,
        data,
        currentUser.id,
      );
      if (ok) {
        let msg = "QI metrics submitted for approval.";
        // Auto-approve Final QA submissions so they can be routed immediately
        if (selectedStage.type === "FINAL_QA") {
          await DataStorage.approveProcessStageQI(
            selectedStage._id,
            currentUser.id,
          );
          msg = "QI metrics submitted and verified. You can now Route Forward.";
        }
        setShowQiModal(false);
        loadData();
        showToast({ message: msg, type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to submit QI.",
        type: "error",
      });
    }
  };

  const handleApproveQI = (id: string) => {
    const stage = logs.find((s) => s._id === id || s.id === id);
    if (stage) {
      setStageToApprove(stage);
      setShowApproveModal(true);
    }
  };

  const confirmApproveQI = async () => {
    if (!currentUser || !stageToApprove) return;
    const id = stageToApprove._id || stageToApprove.id || "";

    // Get the rework count from the latest unverified submission
    let reworkCount = 0;
    if (stageToApprove.submissions) {
      const pendingSubIndex = [...stageToApprove.submissions]
        .reverse()
        .findIndex((s) => !s.isVerified);
      if (pendingSubIndex !== -1) {
        const realIndex =
          stageToApprove.submissions.length - 1 - pendingSubIndex;
        reworkCount =
          stageToApprove.submissions[realIndex].reworkPartsCount || 0;
      }
    }

    const ok = await DataStorage.approveProcessStageQI(id, currentUser.id);
    if (ok) {
      loadData();
      setShowApproveModal(false);
      setStageToApprove(null);
      const msg =
        reworkCount > 0
          ? `QI results verified.\n\n↩ ${reworkCount} rework parts have been automatically re-queued for the same stage (next cycle).\n\nUse "➔ Route Forward" to send good parts to the next process.`
          : 'QI results verified. Use "➔ Route Forward" to send good parts to the next process.';
      showToast({ message: msg, type: "success" });
    }
  };

  // ---------- Columns ----------
  const getRowStyle = (stage: ProcessStage) => {
    const wo = stage.workOrderId as any;
    const isMain = wo?.type === "MAIN" || !wo?.type;
    const isRework = wo?.type === "REWORK";

    if (isMain)
      return {
        borderTopWidth: 3,
        borderTopColor: "#006b65",
        borderBottomWidth: 1,
        borderBottomColor: "#d9f3f0",
        backgroundColor: "#e8f8f6",
      };
    if (isRework)
      return {
        borderLeftWidth: 5,
        borderLeftColor: "#f59e0b",
        borderTopWidth: 1,
        borderTopColor: "#fde68a",
        borderBottomWidth: 1,
        borderBottomColor: "#fde68a",
        backgroundColor: "#fffbeb",
      };
    // SUB order
    return {
      borderLeftWidth: 4,
      borderLeftColor: "#00877f",
      borderTopWidth: 1,
      borderTopColor: "#d7e6e4",
      borderBottomWidth: 1,
      borderBottomColor: "#d7e6e4",
      backgroundColor: "#f7fbfa",
    };
  };

  const columns: Column<ProcessStage>[] = [
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (stage) => {
        const wo = stage.workOrderId as any;
        const isOutsourced = wo?.isExternalVendor || wo?.isOutsourced;

        if (isOutsourced) {
          if (stage.status === "PENDING") {
            return (
              <TouchableOpacity
                style={[styles.btnAction, { backgroundColor: "#00877f" }]}
                onPress={() => {
                  setSelectedStage(stage);
                  setReceptionData({
                    receivedQuantity: stage.inputQuantity || 0,
                  });
                  setShowReceptionModal(true);
                }}
              >
                <Text style={styles.btnActionText}>Receive Goods</Text>
              </TouchableOpacity>
            );
          }
          if (stage.status === "IN_PROGRESS") {
            return (
              <TouchableOpacity
                style={[styles.btnAction, { backgroundColor: "#ea580c" }]}
                onPress={() => handleOpenQiModal(stage)}
              >
                <Text style={styles.btnActionText}>Vendor QI</Text>
              </TouchableOpacity>
            );
          }
        }

        const role = (currentUser?.role || "").toLowerCase();
        const isFinalQA = activeTab === "FINAL_QA" || stage.type === "FINAL_QA";
        const isFinalQiUser = role.includes("final_qi");

        const isTenantAdmin =
          role === "tenant_admin" ||
          (role.includes("tenant") && role.includes("admin"));
        const isAdminCheck =
          !isTenantAdmin && (role.includes("admin") || role.includes("super"));
        const isManager = role.includes("manager");
        const isPdcUser = role.includes("pdc");
        const isPdcManager = role === "pdc_manager";

        const isMain = wo?.type === "MAIN" || !wo?.type; // Treat missing type as MAIN for safety

        const woIdFull = String(wo?._id || "");
        const targetCount = wo?.targetPartCount || 0;
        const subs = stage.submissions || [];

        const isAssigned =
          !stage.operatorId || stage.operatorId === currentUser?.name;

        // Process-role match: user.process field takes priority; fallback to role string check
        const userProcess = (currentUser as any).process;
        const processMatch = userProcess
          ? userProcess === stage.type || userProcess === "ALL"
          : role.includes(stage.type.toLowerCase().replace(/_/g, ""));
        const isProcessPdc = role.includes("pdc") && processMatch;
        const isProcessQi = role.includes("qi") && processMatch;

        // PDC users may only start their own process stage
        const canStart =
          !isPdcManager &&
          (isAdminCheck ||
            isManager ||
            (isProcessPdc && isAssigned) ||
            (isFinalQA && isFinalQiUser)) &&
          stage.status === "PENDING" &&
          !isMain;

        const machineAssignments = (stage as any).machineAssignments || [];
        const unverifiedSubs = subs.filter((s: any) => !s.isVerified);
        const allMachinesHaveUnverifiedSub =
          machineAssignments.length > 0 &&
          machineAssignments.every((ma: any) =>
            unverifiedSubs.some((s: any) => s.machineId === ma.machineId),
          );

        // Allow re-submission without waiting for verification if there are still unsubmitted parts
        const totalSubmitted = subs.reduce(
          (sum: number, s: any) =>
            sum +
            (s.goodPartsCount || 0) +
            (s.reworkPartsCount || 0) +
            (s.rejectedPartsCount || 0),
          0,
        );
        const inputQty = stage.inputQuantity || targetCount;
        const hasRemainingQtyForQI = inputQty <= 0 || totalSubmitted < inputQty;
        const hasUnverifiedSubmissions = subs.some((s: any) => !s.isVerified);
        const hasVerifiedSubs = subs.some((s: any) => s.isVerified);

        // For single/no-machine stages (e.g. Coating), re-submit is only allowed after
        // the current submission is verified — not while verification is pending.
        const isMultiMachineStage = machineAssignments.length > 1;
        const isReadyForQiSubmission =
          stage.status === "READY_FOR_QI" ||
          (stage.status === "QI_SUBMITTED" &&
            hasUnverifiedSubmissions &&
            isMultiMachineStage) ||
          // After a partial-batch approval, backend resets to IN_PROGRESS — QI can submit again
          // For Final QA, they can submit directly from IN_PROGRESS without needing a PDC signal
          (stage.status === "IN_PROGRESS" &&
            (hasVerifiedSubs || stage.type === "FINAL_QA"));

        const canSubmitQI =
          (isAdminCheck ||
            isManager ||
            isProcessQi ||
            (isFinalQA && isFinalQiUser)) &&
          isReadyForQiSubmission &&
          (!allMachinesHaveUnverifiedSub || hasRemainingQtyForQI) &&
          !isMain;

        const hasVerifiedSubmissions = subs.some((s: any) => s.isVerified);
        const canSignalQI =
          (isAdminCheck || isManager || isProcessPdc) &&
          stage.status === "IN_PROGRESS" &&
          !hasVerifiedSubmissions &&
          !isMain;
        const canApproveQI =
          (isAdminCheck ||
            isManager ||
            isProcessPdc ||
            (isFinalQA && isFinalQiUser)) &&
          (stage.status === "QI_SUBMITTED" ||
            (hasUnverifiedSubmissions &&
              stage.status !== "PENDING" &&
              stage.status !== "COMPLETED")) &&
          !isMain;

        const requiredQty = stage.inputQuantity || targetCount;
        const routedPartsCount = (stage as any).routedPartsCount || 0;
        const newGoodParts = (stage.goodPartsCount || 0) - routedPartsCount;
        const canRouteActive =
          (isAdminCheck ||
            isManager ||
            isProcessPdc ||
            (isFinalQA && isFinalQiUser)) &&
          newGoodParts > 0 && // Hide once all verified good parts already routed
          subs.length > 0 && // At least one QI submission must exist
          stage.status !== "PENDING" &&
          stage.status !== "COMPLETED" &&
          !isMain;
        const isRouteVisible =
          (isAdminCheck ||
            isManager ||
            isProcessPdc ||
            (isFinalQA && isFinalQiUser)) &&
          !isMain;

        const stageId = stage._id || stage.id || "";
        const hasLog = (stage.stageLog || []).length > 0;

        return (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              {canStart && (
                <TouchableOpacity
                  style={[styles.btnAction, { backgroundColor: "#dcfce7" }]}
                  onPress={() => openStartModal(stage)}
                >
                  <Text style={[styles.btnActionText, { color: "#166534" }]}>
                    ▶ Start
                  </Text>
                </TouchableOpacity>
              )}
              {canSubmitQI && (
                <TouchableOpacity
                  style={[styles.btnAction, { backgroundColor: "#d9f3f0" }]}
                  onPress={() => handleOpenQiModal(stage)}
                >
                  <Text style={[styles.btnActionText, { color: "#006b65" }]}>
                    📋 Submit QI
                  </Text>
                </TouchableOpacity>
              )}
              {canSignalQI && (
                <TouchableOpacity
                  style={[styles.btnAction, { backgroundColor: "#fef3c7" }]}
                  onPress={() => handleSignalQI(stage)}
                >
                  <Text style={[styles.btnActionText, { color: "#d97706" }]}>
                    ➔ Send to QI
                  </Text>
                </TouchableOpacity>
              )}
              {canApproveQI && (
                <TouchableOpacity
                  style={[styles.btnAction, { backgroundColor: "#dcfce7" }]}
                  onPress={() => handleApproveQI(stage._id!)}
                >
                  <Text style={[styles.btnActionText, { color: "#166534" }]}>
                    ✓ Verify Area
                  </Text>
                </TouchableOpacity>
              )}
              {isRouteVisible && (
                <TouchableOpacity
                  disabled={!canRouteActive}
                  style={[
                    styles.btnAction,
                    {
                      backgroundColor: canRouteActive ? "#fef3c7" : "#edf5f4",
                      opacity: canRouteActive ? 1 : 0.7,
                    },
                  ]}
                  onPress={() => {
                    setSelectedStage(stage);
                    setNextType(null);
                    setShowRouteModal(true);
                  }}
                >
                  <Text
                    style={[
                      styles.btnActionText,
                      { color: canRouteActive ? "#d97706" : "#7a9692" },
                    ]}
                  >
                    {stage.status === "COMPLETED"
                      ? "✓ Routed"
                      : "➔ Route Forward"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btnAction, { backgroundColor: "#edf5f4" }]}
                onPress={() => handleViewJourney(stage)}
              >
                <Text style={[styles.btnActionText, { color: "#5b7773" }]}>
                  🕒 Timeline
                </Text>
              </TouchableOpacity>

              {!canSubmitQI &&
                !canApproveQI &&
                !canRouteActive &&
                !canStart &&
                !isOutsourced && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#7a9692",
                      fontStyle: "italic",
                    }}
                  >
                    View Only
                  </Text>
                )}
            </View>
            {hasLog && (
              <TouchableOpacity
                onPress={() =>
                  setExpandedLogId(expandedLogId === stageId ? null : stageId)
                }
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text
                  style={{ fontSize: 11, color: "#00877f", fontWeight: "600" }}
                >
                  {expandedLogId === stageId ? "▲ Hide Log" : "▼ Stage Log"} (
                  {stage.stageLog!.length})
                </Text>
              </TouchableOpacity>
            )}
            {expandedLogId === stageId && (
              <View
                style={{
                  backgroundColor: "#f7fbfa",
                  borderRadius: 6,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: "#d7e6e4",
                }}
              >
                {(stage.stageLog || []).map((entry, idx) => (
                  <View
                    key={idx}
                    style={{
                      marginBottom: 6,
                      paddingBottom: 6,
                      borderBottomWidth:
                        idx < stage.stageLog!.length - 1 ? 1 : 0,
                      borderBottomColor: "#d7e6e4",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: "#315451",
                      }}
                    >
                      {entry.action}
                    </Text>
                    <Text style={{ fontSize: 10, color: "#5b7773" }}>
                      {fmtDateTime(entry.timestamp)} ·{" "}
                      {entry.actorName || entry.actorId}
                    </Text>
                    {entry.note && (
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#486966",
                          fontStyle: "italic",
                        }}
                      >
                        {entry.note}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      render: (stage: any) => (
        <View>
          <StatusBadge
            variant={(
              stage.effectiveStatus ||
              stage.status ||
              "PENDING"
            ).toLowerCase()}
          />
          {stage.status === "READY_FOR_QI" && (
            <View
              style={{
                marginTop: 4,
                backgroundColor: "#fef3c7",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: "#fde68a",
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{ fontSize: 9, fontWeight: "800", color: "#b45309" }}
              >
                READY FOR INSPECTION
              </Text>
            </View>
          )}
          {stage.status === "QI_SUBMITTED" && (
            <View
              style={{
                marginTop: 4,
                backgroundColor: "#fff7ed",
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: "#ffedd5",
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{ fontSize: 9, fontWeight: "800", color: "#c2410c" }}
              >
                VERIFICATION PENDING
              </Text>
            </View>
          )}
          {stage.submissions?.length > 0 && (
            <View
              style={{
                marginTop: 4,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#00877f",
                }}
              />
              <Text
                style={{ fontSize: 10, fontWeight: "700", color: "#5b7773" }}
              >
                {stage.submissions.length} Submissions
              </Text>
            </View>
          )}
        </View>
      ),
    },
    ...(activeTab === "OUTSOURCED"
      ? [
          {
            key: "vendor",
            header: "Vendor Details",
            width: 200,
            render: (stage: ProcessStage) => {
              const wo = stage.workOrderId as any;
              if (!wo?.vendorName)
                return <Text style={{ color: "#7a9692" }}>Not Specified</Text>;
              return (
                <View>
                  <Text style={{ fontWeight: "700", color: "#183f3c" }}>
                    {wo.vendorName}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#5b7773" }}>
                    📍 {wo.vendorCity || "N/A"}, {wo.vendorArea || "N/A"}
                  </Text>
                </View>
              );
            },
          },
        ]
      : []),
    {
      key: "workOrderId",
      header: "Work Order",
      width: 200,
      render: (stage) => {
        const reworkCycle = stage.reworkCycle || 0;
        const wo = stage.workOrderId as any;
        const woId =
          wo?.workOrderId ||
          `WO-${String(wo?.id || wo?._id || "")
            .slice(-6)
            .toUpperCase()}`;
        const type = wo?.type || "MAIN";
        const isMain = type === "MAIN";
        const mainWoId = String(wo?._id || "");
        const hasChildren = (stage as any)._hasChildren;
        const isExpanded = expandedOrders.has(mainWoId);

        const typeLabel =
          type === "MAIN" ? "PARENT" : type === "SUB" ? "SUB-ORDER" : "REWORK";
        const typeBg =
          type === "MAIN" ? "#e8f8f6" : type === "SUB" ? "#ecfeff" : "#fffbeb";
        const typeText =
          type === "MAIN" ? "#006b65" : type === "SUB" ? "#0891b2" : "#b45309";
        const typeBorder =
          type === "MAIN" ? "#bfdbfe" : type === "SUB" ? "#a5f3fc" : "#fde68a";

        const isRework = type === "REWORK";
        const indentLeft = isMain ? 0 : isRework ? 48 : 24;
        const connectorColor = isRework ? "#f59e0b" : "#c8dbd8";
        return (
          <View
            style={{
              paddingLeft: indentLeft,
              flexDirection: "row",
              alignItems: "flex-start",
            }}
          >
            {!isMain && (
              <View
                style={{
                  width: 15,
                  height: 20,
                  borderLeftWidth: 2,
                  borderBottomWidth: 2,
                  borderColor: connectorColor,
                  marginRight: 8,
                  marginTop: -10,
                  borderBottomLeftRadius: 6,
                }}
              />
            )}
            <View style={{ flex: 1, paddingTop: isMain ? 0 : 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                {isMain && hasChildren && (
                  <TouchableOpacity
                    onPress={() => toggleExpand(mainWoId)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: "#edf5f4",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#486966",
                        fontWeight: "800",
                      }}
                    >
                      {isExpanded ? "▼" : "▶"}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: isRework ? "#92400e" : "#1e3a5f",
                  }}
                >
                  {woId}
                </Text>
                <View
                  style={{
                    backgroundColor: typeBg,
                    borderRadius: isRework ? 6 : 4,
                    paddingHorizontal: isRework ? 8 : 6,
                    paddingVertical: isRework ? 3 : 2,
                    borderWidth: 1,
                    borderColor: typeBorder,
                  }}
                >
                  <Text
                    style={{
                      fontSize: isRework ? 10 : 9,
                      fontWeight: "800",
                      color: typeText,
                      letterSpacing: 0.5,
                    }}
                  >
                    {typeLabel}
                  </Text>
                </View>
              </View>
              {wo?.partId && (
                <Text style={{ fontSize: 11, color: "#5b7773" }}>
                  Part: {wo.partId}
                </Text>
              )}
              {reworkCycle > 0 && (
                <View
                  style={{
                    backgroundColor: "#fef3c7",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginTop: 4,
                    alignSelf: "flex-start",
                    borderWidth: 1,
                    borderColor: "#fcd34d",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: "#92400e",
                    }}
                  >
                    ↩ Rework Cycle {reworkCycle}
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      },
    },
    {
      key: "machineId",
      header: "Machine",
      width: 130,
      render: (stage) => {
        const assignments = stage.machineAssignments;
        if (assignments && assignments.length > 1) {
          return (
            <View>
              {assignments.map((a, i) => (
                <Text key={i} style={{ fontSize: 11, color: "#00877f" }}>
                  • {a.machineId} ({a.qty} pcs)
                </Text>
              ))}
            </View>
          );
        }
        return (
          <Text style={{ fontSize: 12, color: "#486966" }}>
            {stage.machineId || "—"}
          </Text>
        );
      },
    },
    {
      key: "plannedTiming",
      header: "Timing",
      width: 90,
      render: (stage) => (
        <Text style={{ fontSize: 12, color: "#10b981", fontWeight: "bold" }}>
          {stage.plannedTiming || "—"}
        </Text>
      ),
    },
    { key: "inputQuantity", header: "Input", width: 80 },
    { key: "goodPartsCount", header: "Good ✓", width: 80 },
    { key: "reworkPartsCount", header: "Rework ↩", width: 80 },
    { key: "rejectedPartsCount", header: "Rejected ✕", width: 90 },
    {
      key: "scrapWeightKg",
      header: "Scrap (KG)",
      width: 90,
      render: (stage) => (
        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#dc2626" }}>
            {stage.scrapWeightKg || 0}
          </Text>
          {stage.scrapReasons && stage.scrapReasons.length > 0 && (
            <Text style={{ fontSize: 9, color: "#7a9692" }}>
              {stage.scrapReasons.join(", ")}
            </Text>
          )}
        </View>
      ),
    },
  ];

  const userRole = (currentUser?.role || "").toLowerCase();
  const isManagerOrAdmin =
    userRole.includes("manager") ||
    userRole.includes("admin") ||
    userRole.includes("super") ||
    userRole.includes("tenant");

  const userProcess = (currentUser as any)?.process; // assigned processId from user profile
  const visibleProcesses = [
    ...allProcesses,
    { processId: "OUTSOURCED", processName: "Vendor Hub" },
  ].filter((p) => {
    const tab = p.processId;
    if (tab === "OUTSOURCED") return true;
    if (isManagerOrAdmin) return true;
    if (userRole.includes("qi")) return true;
    // Match by the user's assigned process field (dynamic processId)
    if (userProcess && userProcess !== "ALL" && tab === userProcess)
      return true;
    if (userProcess === "ALL") return true;
    // Legacy fallback for hardcoded process IDs
    if (tab === "DIE_CASTING" && userRole.includes("diecasting")) return true;
    if (tab === "COATING" && userRole.includes("coating")) return true;
    if (tab === "MACHINING" && userRole.includes("machining")) return true;
    if (tab === "FINAL_QA" && userRole.includes("final_qi")) return true;
    return false;
  });

  const isOngoing =
    selectedStage &&
    ([ProcessStageStatus.IN_PROGRESS, ProcessStageStatus.QI_SUBMITTED].includes(
      selectedStage.status,
    ) ||
      (selectedStage.status === ProcessStageStatus.PDC_VERIFIED &&
        (selectedStage.goodPartsCount || 0) <
          ((selectedStage.workOrderId as any)?.targetPartCount || 0)));

  useEffect(() => {
    if (
      dataLoaded &&
      visibleProcesses.length > 0 &&
      !visibleProcesses.some((p) => p.processId === activeTab)
    ) {
      setActiveTab(visibleProcesses[0].processId);
    }
  }, [visibleProcesses, activeTab, dataLoaded]);

  const isMultiMachineStage =
    selectedStage &&
    (!!allProcesses.find((p: any) => p.processId === selectedStage.type)
      ?.isMultiMachine ||
      ["DIE_CASTING", "COATING", "MACHINING"].includes(selectedStage.type));

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
          colors={["#00877f"]}
        />
      }
    >
      <View style={styles.maxWidth}>
        <PageHeader
          title="Production Pipeline"
          subtitle="Manage process logs tracking specific components"
        />

        {/* Process tabs */}
        <View style={styles.tabBar}>
          {visibleProcesses.map((p) => (
            <TouchableOpacity
              key={p.processId}
              style={[
                styles.tab,
                activeTab === p.processId && styles.tabActive,
              ]}
              onPress={() => onTabPress(p.processId)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === p.processId && styles.tabTextActive,
                ]}
              >
                {p.processId === "OUTSOURCED" ? "📦 " : ""}
                {p.processName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status filter */}
        <View style={styles.filterRow}>
          {[
            "all",
            "PENDING",
            "IN_PROGRESS",
            "READY_FOR_QI",
            "QI_SUBMITTED",
            "PDC_VERIFIED",
            "COMPLETED",
          ].map((f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterBtn,
                statusFilter === f && styles.filterBtnActive,
              ]}
              onPress={() => setStatusFilter(f)}
            >
              <Text
                style={[
                  styles.filterBtnText,
                  statusFilter === f && styles.filterBtnTextActive,
                ]}
              >
                {f === "all"
                  ? "All"
                  : f.replace("_", " ").charAt(0) +
                    f.replace("_", " ").slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !refreshing ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#00877f" />
            <Text
              style={{ marginTop: 12, color: "#5b7773", fontWeight: "600" }}
            >
              Loading Data...
            </Text>
          </View>
        ) : (
          <>
            {activeTab === "OUTSOURCED" && (
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#e8f8f6",
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#bfdbfe",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#006b65",
                      fontWeight: "700",
                    }}
                  >
                    UNITS WITH VENDORS
                  </Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "800",
                      color: "#1e3a8a",
                    }}
                  >
                    {displayLogs
                      .reduce((acc, l) => acc + (l.inputQuantity || 0), 0)
                      .toLocaleString()}
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#f0fdf4",
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#bbf7d0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#166534",
                      fontWeight: "700",
                    }}
                  >
                    AWAITING RECEPTION
                  </Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "800",
                      color: "#14532d",
                    }}
                  >
                    {displayLogs.filter((l) => l.status === "PENDING").length}{" "}
                    Jobs
                  </Text>
                </View>
              </View>
            )}

            <DataTable
              data={displayLogs}
              columns={columns}
              rowStyle={getRowStyle}
              keyExtractor={(l) => l._id || l.id || Math.random().toString()}
              emptyMessage={`No ${statusFilter !== "all" ? statusFilter.toLowerCase().replace("_", " ") : ""} production logs for ${activeTab.replace("_", " ")}`}
            />
          </>
        )}

        {/* ── Reception Modal ──────────────────────────────────────────────── */}
        <FormModal
          visible={showReceptionModal}
          title="Receive Vendor Goods"
          subtitle={`Receiving parts for ${selectedStage?.workOrderId?.workOrderId || "Work Order"}`}
          onClose={() => setShowReceptionModal(false)}
          onSave={handleReceiveGoods}
          saveLabel="Record Reception"
        >
          <FormField label="Received Quantity (PCS)" required>
            <TextInput
              style={inputStyle.input}
              placeholder="0"
              keyboardType="numeric"
              value={String(receptionData.receivedQuantity || "")}
              onChangeText={(t) =>
                setReceptionData({
                  ...receptionData,
                  receivedQuantity: parseInt(t) || 0,
                })
              }
            />
          </FormField>
          <View
            style={{
              backgroundColor: "#e8f8f6",
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <Text style={{ fontSize: 13, color: "#006b65", fontWeight: "600" }}>
              ℹ️ After recording reception, the job will move to 'In Progress'
              for Quality Inspection.
            </Text>
          </View>
        </FormModal>

        {/* ── PDC Verify Approve Modal ──────────────────────────────────────────────── */}
        <FormModal
          visible={showApproveModal}
          title="Verify Production Submission"
          subtitle="Review details before approval"
          onClose={() => {
            setShowApproveModal(false);
            setStageToApprove(null);
          }}
          onSave={confirmApproveQI}
          saveLabel="Approve"
        >
          {(() => {
            if (!stageToApprove) return null;
            const pendingSubs = (stageToApprove.submissions || []).filter(
              (s) => !s.isVerified,
            );
            if (pendingSubs.length === 0)
              return (
                <Text
                  style={{ padding: 20, textAlign: "center", color: "#5b7773" }}
                >
                  No pending submissions found.
                </Text>
              );

            const wo = stageToApprove.workOrderId as any;
            const weightPerPart = wo?.weightPerPart || 0;

            return (
              <View style={{ gap: 12 }}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#183f3c",
                    marginBottom: 4,
                  }}
                >
                  Review Pending Batches ({pendingSubs.length})
                </Text>

                <ScrollView style={{ maxHeight: 400 }}>
                  <View style={{ gap: 12 }}>
                    {pendingSubs.map((sub, idx) => {
                      const rejectedCount = sub.rejectedPartsCount || 0;
                      const rejectedWeight = rejectedCount * weightPerPart;

                      return (
                        <View
                          key={idx}
                          style={{
                            backgroundColor: "#f7fbfa",
                            padding: 14,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: "#d7e6e4",
                            gap: 6,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 2,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "800",
                                color: "#315451",
                              }}
                            >
                              Batch #{idx + 1}
                            </Text>
                            <Text style={{ fontSize: 10, color: "#5b7773" }}>
                              {fmtDateTime(sub.timestamp)}
                            </Text>
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 2,
                              borderBottomWidth: 1,
                              borderBottomColor: "#c8dbd8",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#486966",
                                fontWeight: "600",
                              }}
                            >
                              Good Parts:
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#16a34a",
                                fontWeight: "700",
                              }}
                            >
                              {sub.goodPartsCount}
                            </Text>
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 2,
                              borderBottomWidth: 1,
                              borderBottomColor: "#c8dbd8",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#486966",
                                fontWeight: "600",
                              }}
                            >
                              Rejected Parts:
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#dc2626",
                                fontWeight: "700",
                              }}
                            >
                              {sub.rejectedPartsCount}
                            </Text>
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 2,
                              borderBottomWidth: 1,
                              borderBottomColor: "#c8dbd8",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#486966",
                                fontWeight: "600",
                              }}
                            >
                              Rework Parts:
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#d97706",
                                fontWeight: "700",
                              }}
                            >
                              {sub.reworkPartsCount}
                            </Text>
                          </View>

                          {rejectedWeight > 0 && (
                            <View
                              style={{
                                backgroundColor: "#fef2f2",
                                padding: 6,
                                borderRadius: 6,
                                marginTop: 4,
                                borderWidth: 1,
                                borderColor: "#fca5a5",
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: "#991b1b",
                                  fontWeight: "700",
                                }}
                              >
                                Auto-Inventory Return:{" "}
                                {rejectedWeight.toFixed(3)} KG
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>

                <Text
                  style={{
                    fontSize: 12,
                    color: "#5b7773",
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  By clicking Approve, ALL {pendingSubs.length} batches shown
                  above will be verified and materials reconciled.
                </Text>
              </View>
            );
          })()}
        </FormModal>

        {/* ── QI Submit Modal ──────────────────────────────────────────────── */}
        <FormModal
          visible={showQiModal}
          title="Submit Production QI Results"
          subtitle={`Recording results for ${selectedStage?.workOrderId?.workOrderId || `WO-${(selectedStage?.workOrderId?.id || selectedStage?.workOrderId?._id || selectedStage?.workOrderId || "").toString().slice(-6).toUpperCase()}`}`}
          onClose={() => setShowQiModal(false)}
          onSave={handleSubmitQI}
          saveLabel="Submit QI Response"
        >
          {/* ── Batch info banner ─────────────────────────────────────────────── */}
          {(() => {
            const wo = selectedStage?.workOrderId as any;
            const batchNo = wo?.batchNumber || "";
            if (!batchNo) return null;
            return (
              <View
                style={{
                  backgroundColor: "#e8f8f6",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#6ee7b7",
                  padding: 12,
                  marginBottom: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#047857",
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    Batch No
                  </Text>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "900",
                      color: "#059669",
                      marginTop: 2,
                    }}
                  >
                    {batchNo}
                  </Text>
                </View>
                {wo?.partName ? (
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#5b7773",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Part
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#083d3a",
                        marginTop: 2,
                      }}
                    >
                      {wo.partName}
                    </Text>
                  </View>
                ) : null}
                {wo?.workOrderId ? (
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#5b7773",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Work Order
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#083d3a",
                        marginTop: 2,
                      }}
                    >
                      {wo.workOrderId}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* ── Machine selector (multi-machine only, not shown for Coating) ─ */}
          {(() => {
            const assignments = (selectedStage?.machineAssignments ||
              []) as any[];
            const isCoatingQi =
              (selectedStage?.type || "").toUpperCase() === "COATING";
            if (assignments.length <= 1 || isCoatingQi) return null;

            const submittedMachineIds = new Set(
              ((selectedStage as any)?.submissions || [])
                .map((s: any) => s.machineId)
                .filter(Boolean),
            );
            const available = assignments.filter(
              (a) => !submittedMachineIds.has(a.machineId),
            );

            if (available.length === 0) {
              return (
                <View
                  style={{
                    backgroundColor: "#f0fdf4",
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#bbf7d0",
                    marginBottom: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#166534",
                      fontWeight: "700",
                    }}
                  >
                    ✅ All machines have submitted QI for this stage.
                  </Text>
                </View>
              );
            }

            return (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    color: "#00877f",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  🔧 Select Machine
                </Text>
                <Select
                  label=""
                  placeholder="Select machine to submit QI for"
                  value={qiData.machineId}
                  options={available.map((a: any) => ({
                    label: `${a.machineId}  —  Target: ${a.qty ?? a.targetQuantity ?? a.targetPartCount ?? "?"} pcs`,
                    value: a.machineId,
                  }))}
                  onSelect={handleQiMachineSelect}
                />
                {qiData.machineId && qiData.machineMappedQty > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginTop: 8,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: "#d9f3f0",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#00877f",
                          fontWeight: "700",
                        }}
                      >
                        Machine: {qiData.machineId}
                      </Text>
                    </View>
                    <View
                      style={{
                        backgroundColor: "#dcfce7",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#166534",
                          fontWeight: "700",
                        }}
                      >
                        Allocated: {qiData.machineMappedQty} pcs
                      </Text>
                    </View>
                    {submittedMachineIds.size > 0 && (
                      <View
                        style={{
                          backgroundColor: "#fef9c3",
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#854d0e",
                            fontWeight: "600",
                          }}
                        >
                          {submittedMachineIds.size} machine(s) already
                          submitted
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })()}

          <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
            <FormField label="Target Quantity" containerStyle={{ flex: 1 }}>
              <TextInput
                style={[
                  inputStyle.input,
                  { backgroundColor: "#edf5f4", color: "#5b7773" },
                ]}
                value={
                  qiData.machineMappedQty > 0
                    ? qiData.machineMappedQty.toString()
                    : (
                        selectedStage?.inputQuantity ||
                        (selectedStage?.workOrderId as any)?.targetPartCount ||
                        0
                      ).toString()
                }
                editable={false}
              />
            </FormField>
          </View>

          {(() => {
            const wo = selectedStage?.workOrderId as any;
            const target =
              selectedStage?.inputQuantity || wo?.targetPartCount || 0;
            const subs = selectedStage?.submissions || [];

            const prevGood = subs.reduce(
              (sum, s) => sum + (s.goodPartsCount || 0),
              0,
            );
            const prevRework = subs.reduce(
              (sum, s) => sum + (s.reworkPartsCount || 0),
              0,
            );
            const prevRejected = subs.reduce(
              (sum, s) => sum + (s.rejectedPartsCount || 0),
              0,
            );
            const prevSubmitted = prevGood + prevRework + prevRejected;
            const remainingToSubmit = Math.max(0, target - prevSubmitted);

            if (subs.length === 0) return null;

            return (
              <View
                style={{
                  backgroundColor: "#f0fdf4",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#bbf7d0",
                  marginBottom: 16,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    backgroundColor: "#dcfce7",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#166534",
                      textTransform: "uppercase",
                    }}
                  >
                    ⏳ Submission History
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#15803d",
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}
                    >
                      Remaining: {remainingToSubmit} pcs
                    </Text>
                  </View>
                </View>

                {/* Per-submission detail rows */}
                {(subs as any[]).map((sub: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: "#dcfce7",
                      backgroundColor: sub.isVerified ? "#f0fdf4" : "#fffbeb",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "800",
                            color: "#315451",
                          }}
                        >
                          Batch #{i + 1}
                        </Text>
                        {sub.machineId ? (
                          <Text style={{ fontSize: 10, color: "#5b7773" }}>
                            🏭 {sub.machineId}
                          </Text>
                        ) : null}
                        {sub.productionDate ? (
                          <Text style={{ fontSize: 10, color: "#5b7773" }}>
                            {sub.productionDate}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={{
                          backgroundColor: sub.isVerified
                            ? "#dcfce7"
                            : "#fef3c7",
                          borderRadius: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderWidth: 1,
                          borderColor: sub.isVerified ? "#86efac" : "#fcd34d",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: sub.isVerified ? "#166534" : "#b45309",
                          }}
                        >
                          {sub.isVerified ? "✓ VERIFIED" : "⏳ PENDING"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 16 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 4,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 10, color: "#5b7773" }}>
                          Good:
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "800",
                            color: "#16a34a",
                          }}
                        >
                          {sub.goodPartsCount || 0}
                        </Text>
                      </View>
                      {(sub.reworkPartsCount || 0) > 0 && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 10, color: "#5b7773" }}>
                            Rework:
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "800",
                              color: "#d97706",
                            }}
                          >
                            {sub.reworkPartsCount}
                          </Text>
                        </View>
                      )}
                      {(sub.rejectedPartsCount || 0) > 0 && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <Text style={{ fontSize: 10, color: "#5b7773" }}>
                            Rejected:
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "800",
                              color: "#dc2626",
                            }}
                          >
                            {sub.rejectedPartsCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    {/* Rework reasons */}
                    {sub.reworkReasons && sub.reworkReasons.length > 0 && (
                      <View
                        style={{
                          marginTop: 4,
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {sub.reworkReasons.map((r: any, ri: number) => (
                          <View
                            key={ri}
                            style={{
                              backgroundColor: "#fef3c7",
                              borderRadius: 4,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderWidth: 1,
                              borderColor: "#fcd34d",
                            }}
                          >
                            <Text style={{ fontSize: 10, color: "#92400e" }}>
                              ↩ {r.reason}
                              {r.count ? ` (${r.count})` : ""}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {/* Rejection reasons */}
                    {sub.rejectionReasons &&
                      sub.rejectionReasons.length > 0 && (
                        <View
                          style={{
                            marginTop: 4,
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 4,
                          }}
                        >
                          {sub.rejectionReasons.map((r: any, ri: number) => (
                            <View
                              key={ri}
                              style={{
                                backgroundColor: "#fee2e2",
                                borderRadius: 4,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderWidth: 1,
                                borderColor: "#fca5a5",
                              }}
                            >
                              <Text style={{ fontSize: 10, color: "#991b1b" }}>
                                ✕ {r.reason}
                                {r.count ? ` (${r.count})` : ""}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                  </View>
                ))}

                {/* Aggregate summary footer */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: "#dcfce7",
                    flexDirection: "row",
                    justifyContent: "space-around",
                  }}
                >
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#14532d",
                        fontWeight: "600",
                      }}
                    >
                      TOTAL GOOD
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "900",
                        color: "#16a34a",
                      }}
                    >
                      {prevGood}
                    </Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#92400e",
                        fontWeight: "600",
                      }}
                    >
                      TOTAL REWORK
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "900",
                        color: "#d97706",
                      }}
                    >
                      {prevRework}
                    </Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#991b1b",
                        fontWeight: "600",
                      }}
                    >
                      TOTAL REJECTED
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "900",
                        color: "#dc2626",
                      }}
                    >
                      {prevRejected}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* ── Acceptance Points (from Work Order) ───────────────────────────── */}
          {(() => {
            const pts: string[] =
              (selectedStage?.workOrderId as any)?.acceptancePoints || [];
            if (pts.length === 0) return null;
            return (
              <View style={styles.acceptanceBox}>
                <Text style={styles.acceptanceTitle}>
                  ✅ Acceptance Points to Verify
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {pts.map((pt, i) => (
                    <View key={i} style={styles.acceptancePill}>
                      <Text style={styles.acceptancePillText}>✓ {pt}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {/* Section: Material Info */}
          {/* Section: Material & Part Info */}
          {/* <View style={{ backgroundColor: '#fffbeb', padding: 12, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#fde68a' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400e' }}>⚖️ MATERIAL & PART INFO</Text>
              <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400e' }}>SYSTEM REF</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
              <View style={{ width: '47%' }}>
                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '700' }}>ACTUAL RECEIVED (KG)</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#78350f' }}>{qiData.actualReceivedKg || '0.00'}</Text>
              </View>
              <View style={{ width: '47%' }}>
                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '700' }}>WEIGHT PER PART (KG)</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#78350f' }}>{(selectedStage?.workOrderId as any)?.weightPerPart || 0} kg</Text>
              </View>
              <View style={{ width: '47%', marginTop: 8 }}>
                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '700' }}>MATERIAL GRADE</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#78350f' }}>{(selectedStage?.workOrderId as any)?.materialGrade || 'N/A'}</Text>
              </View>
              <View style={{ width: '47%', marginTop: 8 }}>
                <Text style={{ fontSize: 10, color: '#b45309', fontWeight: '700' }}>WO TARGET QTY</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#78350f' }}>{(selectedStage?.workOrderId as any)?.targetPartCount || 0} pcs</Text>
              </View>
            </View>
          </View> */}

          {/* Section: Quality Results */}
          <View
            style={{
              marginBottom: 16,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#edf5f4",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: "#00877f",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              📊 Production Output
            </Text>

            <FormField
              label="Production QI Date *"
              containerStyle={{ marginBottom: 12 }}
            >
              <DatePicker
                value={(qiData as any).submissionDate || ""}
                onChange={(d) =>
                  setQiData({ ...qiData, submissionDate: d } as any)
                }
              />
            </FormField>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <FormField label="Good Parts *" containerStyle={{ flex: 1 }}>
                <TextInput
                  style={[
                    inputStyle.input,
                    { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
                  ]}
                  keyboardType="numeric"
                  placeholder="0"
                  value={qiData.goodPartsCount.toString()}
                  onChangeText={(t) => {
                    const qty = parseInt(t) || 0;
                    const wo = selectedStage?.workOrderId as any;
                    const woPartId = (wo?.partId || "")
                      .toString()
                      .trim()
                      .toLowerCase();
                    const partInfo = partsMaster.find(
                      (p) =>
                        (p.partId || "").toString().trim().toLowerCase() ===
                        woPartId,
                    );
                    const wpp =
                      wo?.weightPerPart || partInfo?.weightPerPartKg || 0;
                    const bufferPercent = partInfo?.bufferPercent || 0;

                    const currentBatchTotal =
                      qty + qiData.reworkPartsCount + qiData.rejectedPartsCount;
                    const targetQty =
                      qiData.machineMappedQty > 0
                        ? qiData.machineMappedQty
                        : selectedStage?.inputQuantity ||
                          wo?.targetPartCount ||
                          0;
                    const stageT = (selectedStage?.type || "").toUpperCase();
                    const bufAppl = !["COATING", "MACHINING"].includes(stageT);
                    const scrapAppl = stageT !== "COATING";
                    const outputWeight = parseFloat(
                      (targetQty * wpp).toFixed(3),
                    );
                    const lostWeight = bufAppl
                      ? parseFloat(
                          ((targetQty * wpp * bufferPercent) / 100).toFixed(3),
                        )
                      : 0;
                    const scrapWeight =
                      scrapAppl &&
                      qiData.isFirstSubmission &&
                      qiData.machineMappedQty === 0
                        ? parseFloat(
                            (
                              qiData.actualReceivedKg -
                              outputWeight -
                              lostWeight
                            ).toFixed(3),
                          )
                        : 0;

                    setQiData({
                      ...qiData,
                      goodPartsCount: qty,
                      outputWeightKg: outputWeight,
                      lostWeightKg: lostWeight,
                      scrapWeightKg: Math.max(0, scrapWeight),
                      outputQuantity: currentBatchTotal,
                    });
                  }}
                  editable={true}
                />
              </FormField>
              <FormField label="Rework Required" containerStyle={{ flex: 1 }}>
                <TextInput
                  style={[
                    inputStyle.input,
                    { borderColor: "#d97706", backgroundColor: "#fffbeb" },
                  ]}
                  keyboardType="numeric"
                  placeholder="0"
                  value={qiData.reworkPartsCount.toString()}
                  onChangeText={(t) => {
                    const rw = parseInt(t) || 0;
                    const currentBatchTotal =
                      qiData.goodPartsCount + rw + qiData.rejectedPartsCount;

                    const wo = selectedStage?.workOrderId as any;
                    const woPartId = (wo?.partId || "")
                      .toString()
                      .trim()
                      .toLowerCase();
                    const partInfo = partsMaster.find(
                      (p) =>
                        (p.partId || "").toString().trim().toLowerCase() ===
                        woPartId,
                    );
                    const wpp =
                      wo?.weightPerPart || partInfo?.weightPerPartKg || 0;
                    const bufferPercent = partInfo?.bufferPercent || 0;

                    const targetQty =
                      qiData.machineMappedQty > 0
                        ? qiData.machineMappedQty
                        : selectedStage?.inputQuantity ||
                          wo?.targetPartCount ||
                          0;
                    const stageT2 = (selectedStage?.type || "").toUpperCase();
                    const bufAppl2 = !["COATING", "MACHINING"].includes(
                      stageT2,
                    );
                    const scrapAppl2 = stageT2 !== "COATING";
                    const outputWeight = parseFloat(
                      (targetQty * wpp).toFixed(3),
                    );
                    const lostWeight = bufAppl2
                      ? parseFloat(
                          ((targetQty * wpp * bufferPercent) / 100).toFixed(3),
                        )
                      : 0;
                    const scrapWeight =
                      scrapAppl2 &&
                      qiData.isFirstSubmission &&
                      qiData.machineMappedQty === 0
                        ? parseFloat(
                            (
                              qiData.actualReceivedKg -
                              outputWeight -
                              lostWeight
                            ).toFixed(3),
                          )
                        : 0;

                    setQiData({
                      ...qiData,
                      reworkPartsCount: rw,
                      outputWeightKg: outputWeight,
                      lostWeightKg: lostWeight,
                      scrapWeightKg: Math.max(0, scrapWeight),
                      outputQuantity: currentBatchTotal,
                    });
                  }}
                  editable={true}
                />
              </FormField>
            </View>
            <FormField label="Rejected Quantity *">
              <TextInput
                style={[
                  inputStyle.input,
                  {
                    borderColor:
                      qiData.rejectedPartsCount > 0 ? "#dc2626" : "#c8dbd8",
                    backgroundColor:
                      qiData.rejectedPartsCount > 0 ? "#fef2f2" : "#fff",
                  },
                ]}
                keyboardType="numeric"
                placeholder="0"
                value={qiData.rejectedPartsCount.toString()}
                onChangeText={(t) => {
                  const rj = parseInt(t) || 0;
                  const currentBatchTotal =
                    qiData.goodPartsCount + qiData.reworkPartsCount + rj;

                  const wo = selectedStage?.workOrderId as any;
                  const woPartId = (wo?.partId || "")
                    .toString()
                    .trim()
                    .toLowerCase();
                  const partInfo = partsMaster.find(
                    (p) =>
                      (p.partId || "").toString().trim().toLowerCase() ===
                      woPartId,
                  );
                  const wpp =
                    wo?.weightPerPart || partInfo?.weightPerPartKg || 0;
                  const bufferPercent = partInfo?.bufferPercent || 0;

                  const targetQty =
                    qiData.machineMappedQty > 0
                      ? qiData.machineMappedQty
                      : wo?.targetPartCount || 0;
                  const stageT3 = (selectedStage?.type || "").toUpperCase();
                  const bufAppl3 = !["COATING", "MACHINING"].includes(stageT3);
                  const scrapAppl3 = stageT3 !== "COATING";
                  const outputWeight = parseFloat((targetQty * wpp).toFixed(3));
                  const lostWeight = bufAppl3
                    ? parseFloat(
                        ((targetQty * wpp * bufferPercent) / 100).toFixed(3),
                      )
                    : 0;
                  const scrapWeight =
                    scrapAppl3 &&
                    qiData.isFirstSubmission &&
                    qiData.machineMappedQty === 0
                      ? parseFloat(
                          (
                            qiData.actualReceivedKg -
                            outputWeight -
                            lostWeight
                          ).toFixed(3),
                        )
                      : 0;

                  setQiData({
                    ...qiData,
                    rejectedPartsCount: rj,
                    outputWeightKg: outputWeight,
                    lostWeightKg: lostWeight,
                    scrapWeightKg: Math.max(0, scrapWeight),
                    outputQuantity: currentBatchTotal,
                  });
                }}
                editable={true}
              />
            </FormField>
          </View>

          {/* Section 3: Material & Waste */}
          {(() => {
            const qiType = (selectedStage?.type || "").toUpperCase();
            const showBuffer = !["COATING", "MACHINING"].includes(qiType);
            const showScrap = qiType !== "COATING";
            return (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "800",
                    color: "#00877f",
                    marginBottom: 12,
                    textTransform: "uppercase",
                  }}
                >
                  ♻️ Material & Waste
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  <FormField
                    label="Output Weight (KG) *"
                    containerStyle={{ width: "31%" }}
                  >
                    <TextInput
                      style={[
                        inputStyle.input,
                        {
                          backgroundColor: "#edf5f4",
                          color: "#5b7773",
                          fontSize: 13,
                        },
                      ]}
                      keyboardType="numeric"
                      placeholder="0.00"
                      value={qiData.outputWeightKg.toString()}
                      editable={false}
                    />
                  </FormField>
                  {showBuffer && (
                    <FormField
                      label="Lost Weight (KG) *"
                      containerStyle={{ width: "31%" }}
                    >
                      <TextInput
                        style={[
                          inputStyle.input,
                          {
                            backgroundColor: "#edf5f4",
                            color: "#5b7773",
                            fontSize: 13,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="0.00"
                        value={qiData.lostWeightKg.toString()}
                        editable={false}
                      />
                    </FormField>
                  )}
                  {showScrap && (
                    <FormField
                      label="Scrap Weight (KG) *"
                      containerStyle={{ width: "31%" }}
                    >
                      <TextInput
                        style={[
                          inputStyle.input,
                          {
                            backgroundColor: "#edf5f4",
                            color: "#183f3c",
                            fontWeight: "800",
                            fontSize: 13,
                          },
                        ]}
                        keyboardType="numeric"
                        placeholder="0.00"
                        value={qiData.scrapWeightKg.toString()}
                        editable={false}
                      />
                    </FormField>
                  )}
                </View>
              </View>
            );
          })()}

          {/* Rework Reasons List */}
          {qiData.reworkPartsCount > 0 && (
            <FormField label="Rework Reasons & Counts">
              {qiData.reworkReasons.map((r, idx) => (
                <React.Fragment key={idx}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginBottom: 10,
                      alignItems: "center",
                      backgroundColor: "#f7fbfa",
                      padding: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#d7e6e4",
                    }}
                  >
                    <View style={{ flex: 1.5 }}>
                      <Select
                        label=""
                        placeholder="Select Reason"
                        value={r.reason}
                        options={qualityReasons
                          .filter((q) => {
                            const cat = (
                              q.category ||
                              q.reasonType ||
                              q.reason_type ||
                              ""
                            ).toUpperCase();
                            return cat === "REWORK";
                          })
                          .map((q) => ({ label: q.reason, value: q.reason }))}
                        onSelect={(v) => {
                          const reasonObj = qualityReasons.find(
                            (q) => q.reason === v,
                          );
                          const updated = [...qiData.reworkReasons];
                          updated[idx].reason = v;
                          updated[idx].subReasons = []; // Reset sub-reasons when main reason changes
                          updated[idx].availableSubReasons =
                            reasonObj?.subReasons || [];
                          setQiData({ ...qiData, reworkReasons: updated });
                        }}
                      />
                    </View>
                    <TextInput
                      style={[
                        inputStyle.input,
                        { flex: 0.5, backgroundColor: "#fff" },
                      ]}
                      placeholder="Qty"
                      keyboardType="numeric"
                      value={r.count.toString()}
                      onChangeText={(t) => {
                        const updated = [...qiData.reworkReasons];
                        updated[idx].count = parseInt(t) || 0;
                        setQiData({ ...qiData, reworkReasons: updated });
                      }}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setQiData({
                          ...qiData,
                          reworkReasons: qiData.reworkReasons.filter(
                            (_, i) => i !== idx,
                          ),
                        })
                      }
                      style={{
                        backgroundColor: "#fee2e2",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: "#dc2626", fontWeight: "bold" }}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Dynamic Sub-Reasons for Rework */}
                  {r.availableSubReasons &&
                    r.availableSubReasons.length > 0 && (
                      <View style={{ marginLeft: 20, marginBottom: 10 }}>
                        <Select
                          placeholder="Select Sub-Reason (Optional)"
                          value={r.subReason}
                          options={r.availableSubReasons.map((sr: any) => ({
                            label: sr.subReason,
                            value: sr.subReason,
                          }))}
                          onSelect={(v) => {
                            const srObj = r.availableSubReasons.find(
                              (sr: any) => sr.subReason === v,
                            );
                            const updated = [...qiData.reworkReasons];
                            updated[idx].subReason = v;
                            updated[idx].subReasonId =
                              srObj?.subReasonCode || "";
                            setQiData({ ...qiData, reworkReasons: updated });
                          }}
                        />
                      </View>
                    )}
                </React.Fragment>
              ))}
              <TouchableOpacity
                onPress={() =>
                  setQiData({
                    ...qiData,
                    reworkReasons: [
                      ...qiData.reworkReasons,
                      {
                        reason: "",
                        count: 0,
                        subReason: "",
                        availableSubReasons: [],
                      },
                    ],
                  })
                }
                style={{
                  alignSelf: "flex-start",
                  padding: 8,
                  backgroundColor: "#edf5f4",
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: "#486966", fontWeight: "bold" }}
                >
                  + Add Rework Reason
                </Text>
              </TouchableOpacity>
            </FormField>
          )}

          {/* Rejection Reasons List */}
          {qiData.rejectedPartsCount > 0 && (
            <FormField label="Rejection Reasons & Counts *">
              {qiData.rejectionReasons.map((r, idx) => (
                <React.Fragment key={idx}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      marginBottom: 10,
                      alignItems: "center",
                      backgroundColor: "#fff1f2",
                      padding: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#fecdd3",
                    }}
                  >
                    <View style={{ flex: 1.5 }}>
                      <Select
                        label=""
                        placeholder="Select Reason"
                        value={r.reason}
                        options={qualityReasons
                          .filter((q) => {
                            const cat = (
                              q.category ||
                              q.reasonType ||
                              q.reason_type ||
                              ""
                            ).toUpperCase();
                            return cat === "REJECTION";
                          })
                          .map((q) => ({ label: q.reason, value: q.reason }))}
                        onSelect={(v) => {
                          const reasonObj = qualityReasons.find(
                            (q) => q.reason === v,
                          );
                          const updated = [...qiData.rejectionReasons];
                          updated[idx].reason = v;
                          updated[idx].subReasons = [];
                          updated[idx].availableSubReasons =
                            reasonObj?.subReasons || [];
                          setQiData({ ...qiData, rejectionReasons: updated });
                        }}
                      />
                    </View>
                    <TextInput
                      style={[
                        inputStyle.input,
                        { flex: 0.5, backgroundColor: "#fff" },
                      ]}
                      placeholder="Qty"
                      keyboardType="numeric"
                      value={r.count.toString()}
                      onChangeText={(t) => {
                        const updated = [...qiData.rejectionReasons];
                        updated[idx].count = parseInt(t) || 0;
                        setQiData({ ...qiData, rejectionReasons: updated });
                      }}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setQiData({
                          ...qiData,
                          rejectionReasons: qiData.rejectionReasons.filter(
                            (_, i) => i !== idx,
                          ),
                        })
                      }
                      style={{
                        backgroundColor: "#fee2e2",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: "#dc2626", fontWeight: "bold" }}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Dynamic Sub-Reasons for Rejection */}
                  {r.availableSubReasons &&
                    r.availableSubReasons.length > 0 && (
                      <View style={{ marginLeft: 20, marginBottom: 10 }}>
                        <Select
                          placeholder="Select Sub-Reason (Optional)"
                          value={r.subReason}
                          options={r.availableSubReasons.map((sr: any) => ({
                            label: sr.subReason,
                            value: sr.subReason,
                          }))}
                          onSelect={(v) => {
                            const srObj = r.availableSubReasons.find(
                              (sr: any) => sr.subReason === v,
                            );
                            const updated = [...qiData.rejectionReasons];
                            updated[idx].subReason = v;
                            updated[idx].subReasonId =
                              srObj?.subReasonCode || "";
                            setQiData({ ...qiData, rejectionReasons: updated });
                          }}
                        />
                      </View>
                    )}
                </React.Fragment>
              ))}
              <TouchableOpacity
                onPress={() =>
                  setQiData({
                    ...qiData,
                    rejectionReasons: [
                      ...qiData.rejectionReasons,
                      {
                        reason: "",
                        count: 0,
                        subReason: "",
                        availableSubReasons: [],
                      },
                    ],
                  })
                }
                style={{
                  alignSelf: "flex-start",
                  padding: 8,
                  backgroundColor: "#edf5f4",
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{ fontSize: 12, color: "#486966", fontWeight: "bold" }}
                >
                  + Add Rejection Reason
                </Text>
              </TouchableOpacity>
            </FormField>
          )}

          {/* Scrap Reasons List — not applicable for COATING */}
          {qiData.scrapWeightKg > 0 &&
            (selectedStage?.type || "").toUpperCase() !== "COATING" && (
              <FormField label="Scrap Reasons *">
                {qiData.scrapReasons.map((r, idx) => (
                  <React.Fragment key={idx}>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginBottom: 10,
                        alignItems: "center",
                        backgroundColor: "#edf5f4",
                        padding: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#c8dbd8",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Select
                          label=""
                          placeholder="Select Scrap Reason"
                          value={r.reason}
                          options={qualityReasons
                            .filter((q) => {
                              const cat = (
                                q.category ||
                                q.reasonType ||
                                q.reason_type ||
                                ""
                              ).toUpperCase();
                              return cat === "SCRAP";
                            })
                            .map((q) => ({ label: q.reason, value: q.reason }))}
                          onSelect={(v) => {
                            const reasonObj = qualityReasons.find(
                              (q) => q.reason === v,
                            );
                            const updated = [...qiData.scrapReasons];
                            updated[idx] = {
                              reason: v,
                              subReason: "",
                              availableSubReasons: reasonObj?.subReasons || [],
                            };
                            setQiData({ ...qiData, scrapReasons: updated });
                          }}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() =>
                          setQiData({
                            ...qiData,
                            scrapReasons: qiData.scrapReasons.filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        style={{
                          backgroundColor: "#fee2e2",
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <Text style={{ color: "#dc2626", fontWeight: "bold" }}>
                          ✕
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {r.availableSubReasons &&
                      r.availableSubReasons.length > 0 && (
                        <View style={{ marginLeft: 20, marginBottom: 10 }}>
                          <Select
                            placeholder="Select Sub-Reason (Optional)"
                            value={r.subReason}
                            options={r.availableSubReasons.map((sr: any) => ({
                              label: sr.subReason,
                              value: sr.subReason,
                            }))}
                            onSelect={(v) => {
                              const updated = [...qiData.scrapReasons];
                              updated[idx] = { ...updated[idx], subReason: v };
                              setQiData({ ...qiData, scrapReasons: updated });
                            }}
                          />
                        </View>
                      )}
                  </React.Fragment>
                ))}
                <TouchableOpacity
                  onPress={() =>
                    setQiData({
                      ...qiData,
                      scrapReasons: [
                        ...qiData.scrapReasons,
                        { reason: "", subReason: "", availableSubReasons: [] },
                      ],
                    })
                  }
                  style={{
                    alignSelf: "flex-start",
                    padding: 8,
                    backgroundColor: "#edf5f4",
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#486966",
                      fontWeight: "bold",
                    }}
                  >
                    + Add Scrap Reason
                  </Text>
                </TouchableOpacity>
              </FormField>
            )}
        </FormModal>

        {/* ── Start Stage Modal ────────────────────────────────────────────── */}
        <FormModal
          visible={showStartModal}
          title={`Start ${selectedStage?.type?.replace("_", " ")} Process`}
          subtitle="Enter timing and machine details before starting"
          onClose={() => setShowStartModal(false)}
          onSave={handleStart}
          saveLabel="Start Process"
          maxWidth={960}
        >
          {/* WO Reference Card */}
          {selectedStage && (selectedStage.workOrderId as any)?._id && (
            <View style={styles.woRefCard}>
              <Text style={styles.woRefTitle}>📋 Work Order Reference</Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 6,
                }}
              >
                {(() => {
                  const wo = selectedStage.workOrderId as any;
                  const isReworkWo = wo?.type === "REWORK";
                  const reqKg = wo?.requiredQuantityKg || 0;
                  const bufKg = wo?.bufferKg || 0;
                  const totalReq = reqKg + bufKg;

                  const fields: {
                    label: string;
                    val: string | null;
                    highlight?: boolean;
                  }[] = isReworkWo
                    ? [
                        { label: "Part ID", val: wo?.partId },
                        {
                          label: "Master ID",
                          val: extraDetails.masterId || null,
                        },
                        ...(extraDetails.batchNumber
                          ? [
                              {
                                label: "Batch No",
                                val: extraDetails.batchNumber as string,
                              },
                            ]
                          : []),
                        { label: "Grade", val: wo?.materialGrade || null },
                        {
                          label: "Weight / Part",
                          val: `${wo?.weightPerPart || extraDetails.weightPerPart || 0} kg`,
                        },
                        {
                          label: "Price / Part",
                          val: `₹${wo?.pricePerPart || extraDetails.pricePerPart || 0}`,
                        },
                        {
                          label: "Rework Parts",
                          val: `${wo?.targetPartCount} pcs`,
                        },
                      ]
                    : [
                        { label: "Part ID", val: wo?.partId },
                        ...(wo?.batchNumber || extraDetails.batchNumber
                          ? [
                              {
                                label: "Batch No",
                                val:
                                  wo?.batchNumber ||
                                  (extraDetails.batchNumber as string),
                                highlight: false,
                              },
                            ]
                          : []),
                        { label: "Grade", val: wo?.materialGrade },
                        { label: "Base Qty", val: `${reqKg} kg` },
                        {
                          label: "Buffer Qty",
                          val: bufKg > 0 ? `${bufKg} kg` : null,
                        },
                        {
                          label: "TOTAL TO GET FROM STORE",
                          val: `${totalReq} kg`,
                          highlight: true,
                        },
                        {
                          label: "Target Parts",
                          val: `${wo?.targetPartCount} pcs`,
                        },
                      ];

                  return fields
                    .filter((f) => f.val)
                    .map((f) => (
                      <View
                        key={f.label}
                        style={{
                          minWidth: f.highlight ? "100%" : "30%",
                          marginTop: f.highlight ? 8 : 0,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            color: "#5b7773",
                            fontWeight: "600",
                            textTransform: "uppercase",
                          }}
                        >
                          {f.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: f.highlight ? 18 : 13,
                            fontWeight: "800",
                            color: f.highlight ? "#00877f" : "#083d3a",
                          }}
                        >
                          {f.val}
                        </Text>
                      </View>
                    ));
                })()}
              </View>
            </View>
          )}

          {/* ── Material Already Received Banner (second batch) ───────────────── */}
          {extraDetails.siblingAlreadyDeductedMaterial && (
            <View
              style={{
                backgroundColor: "#fef9c3",
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#fde047",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: "#854d0e",
                  marginBottom: 6,
                }}
              >
                📦 Material Already Received for This Order
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {extraDetails.siblingMaterialReceivedKg > 0 && (
                  <View
                    style={{
                      backgroundColor: "#fef08a",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#713f12",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Material Taken
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#92400e",
                      }}
                    >
                      {extraDetails.siblingMaterialReceivedKg} kg
                    </Text>
                  </View>
                )}
                {extraDetails.mainWoTargetCount > 0 && (
                  <View
                    style={{
                      backgroundColor: "#fef08a",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#713f12",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Full Order Qty
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#92400e",
                      }}
                    >
                      {extraDetails.mainWoTargetCount} pcs
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11, color: "#78350f", marginTop: 8 }}>
                Material for this batch is already covered — no additional
                material needed from store.
              </Text>
            </View>
          )}

          {/* ── First-batch context hint when order is being split ─────────────── */}
          {extraDetails.isFirstStage &&
            extraDetails.mainWoTargetCount > extraDetails.targetPartCount && (
              <View
                style={{
                  backgroundColor: "#f0fdf4",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: "#86efac",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: "#166534",
                    marginBottom: 4,
                  }}
                >
                  📋 Batch Split Context
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  <Text style={{ fontSize: 11, color: "#14532d" }}>
                    Full order:{" "}
                    <Text style={{ fontWeight: "800" }}>
                      {extraDetails.mainWoTargetCount} pcs
                    </Text>
                  </Text>
                  {extraDetails.mainWoRequiredKg > 0 && (
                    <Text style={{ fontSize: 11, color: "#14532d" }}>
                      {" "}
                      | Total material ~
                      <Text style={{ fontWeight: "800" }}>
                        {extraDetails.mainWoRequiredKg} kg
                      </Text>
                    </Text>
                  )}
                  <Text style={{ fontSize: 11, color: "#14532d" }}>
                    {" "}
                    | This batch:{" "}
                    <Text style={{ fontWeight: "800" }}>
                      {extraDetails.targetPartCount} pcs
                    </Text>
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: "#15803d", marginTop: 4 }}>
                  Enter material received for this batch only. The remaining
                  batch can be started separately.
                </Text>
              </View>
            )}

          {/* ── First Process: Initial Setup ─────────────────────────────────── */}
          {extraDetails.isFirstStage && (
            <View
              style={{
                backgroundColor: "#f0f9ff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#bae6fd",
              }}
            >
              {/* Previous Submissions in this Stage */}
              {((selectedStage as any)?.submissions?.length || 0) > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: "#5b7773",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    Recent Submissions
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#f7fbfa",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#d7e6e4",
                      overflow: "hidden",
                    }}
                  >
                    {[...(selectedStage as any).submissions]
                      .reverse()
                      .slice(0, 3)
                      .map((sub: any, sIdx: number) => (
                        <View
                          key={sIdx}
                          style={{
                            padding: 10,
                            borderBottomWidth: sIdx < 2 ? 1 : 0,
                            borderBottomColor: "#d7e6e4",
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <View>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: "#315451",
                              }}
                            >
                              Batch {selectedStage.submissions.length - sIdx}
                            </Text>
                            <Text style={{ fontSize: 10, color: "#7a9692" }}>
                              {new Date(sub.timestamp).toLocaleTimeString()}
                            </Text>
                          </View>
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <View style={{ alignItems: "center" }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "700",
                                  color: "#16a34a",
                                }}
                              >
                                G: {sub.goodPartsCount}
                              </Text>
                            </View>
                            <View style={{ alignItems: "center" }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "700",
                                  color: "#dc2626",
                                }}
                              >
                                Rj: {sub.rejectedPartsCount}
                              </Text>
                            </View>
                            <View
                              style={{
                                backgroundColor: sub.isVerified
                                  ? "#dcfce7"
                                  : "#fff7ed",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 9,
                                  fontWeight: "800",
                                  color: sub.isVerified ? "#166534" : "#c2410c",
                                }}
                              >
                                {sub.isVerified ? "VERIFIED" : "PENDING"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}
                  </View>
                </View>
              )}
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "800",
                  color: "#006b65",
                  marginBottom: 14,
                }}
              >
                🏭 First Process: Initial Setup
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <View style={{ width: "47%" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#5b7773",
                      fontWeight: "600",
                      textTransform: "uppercase",
                    }}
                  >
                    Part Name
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#083d3a",
                      marginTop: 2,
                    }}
                  >
                    {extraDetails.partName || "N/A"}
                  </Text>
                </View>
                <View style={{ width: "47%" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#5b7773",
                      fontWeight: "600",
                      textTransform: "uppercase",
                    }}
                  >
                    Master ID
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#083d3a",
                      marginTop: 2,
                    }}
                  >
                    {extraDetails.masterId || "N/A"}
                  </Text>
                  {extraDetails.batchDate ? (
                    <Text
                      style={{ fontSize: 11, color: "#5b7773", marginTop: 2 }}
                    >
                      Date: {fmtDate(extraDetails.batchDate)}
                    </Text>
                  ) : null}
                </View>
                {extraDetails.batchNumber ? (
                  <View style={{ width: "47%" }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#5b7773",
                        fontWeight: "600",
                        textTransform: "uppercase",
                      }}
                    >
                      Batch No
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#059669",
                        marginTop: 2,
                      }}
                    >
                      {extraDetails.batchNumber}
                    </Text>
                  </View>
                ) : null}
                <View style={{ width: "47%", marginTop: 12 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#5b7773",
                      fontWeight: "600",
                      textTransform: "uppercase",
                    }}
                  >
                    Weight Per Part (KG)
                  </Text>
                  <View
                    style={{
                      backgroundColor: "#edf5f4",
                      padding: 8,
                      borderRadius: 6,
                      marginTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "#006b65",
                      }}
                    >
                      {extraDetails.weightPerPart || 0} kg
                    </Text>
                  </View>
                </View>
                <View style={{ width: "47%", marginTop: 12 }}>
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#5b7773",
                      fontWeight: "600",
                      textTransform: "uppercase",
                    }}
                  >
                    Price Per Part (₹) *
                  </Text>
                  <TextInput
                    style={[
                      inputStyle.input,
                      {
                        marginTop: 4,
                        height: 40,
                        fontWeight: "800",
                        color: "#006b65",
                      },
                    ]}
                    keyboardType="numeric"
                    value={extraDetails.pricePerPart?.toString()}
                    onChangeText={(t) =>
                      setExtraDetails({
                        ...extraDetails,
                        pricePerPart: parseFloat(t) || 0,
                      })
                    }
                    placeholder="0.00"
                  />
                  {(extraDetails.pricePerPart || 0) > 0 && (
                    <View
                      style={{
                        marginTop: 4,
                        backgroundColor: "#f0fdf4",
                        padding: 4,
                        borderRadius: 4,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "800",
                          color: "#166534",
                        }}
                      >
                        VAL: ₹
                        {(
                          (extraDetails.pricePerPart || 0) *
                          (extraDetails.targetPartCount || 0)
                        ).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {extraDetails.materialGrade ? (
                <View
                  style={{
                    marginTop: 16,
                    backgroundColor: "#f7fbfa",
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#d7e6e4",
                    borderStyle: "dashed",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#5b7773",
                      fontWeight: "600",
                    }}
                  >
                    Material Grade:
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#083d3a",
                      fontWeight: "700",
                    }}
                  >
                    {extraDetails.materialGrade}
                  </Text>
                </View>
              ) : null}

              {activeBatchDetails && (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      color:
                        (activeBatchDetails.availableStockKg || 0) <
                        (extraDetails.requiredQuantityKg || 0)
                          ? "#ef4444"
                          : "#16a34a",
                      fontWeight: "700",
                    }}
                  >
                    Available Stock: {activeBatchDetails.availableStockKg || 0}{" "}
                    KG
                    {(activeBatchDetails.availableStockKg || 0) <
                      (extraDetails.requiredQuantityKg || 0) && " (NOT ENOUGH)"}
                  </Text>
                </View>
              )}

              {/* Material Reconciliation moved inside each machine row for Die Casting */}
            </View>
          )}

          {(() => {
            const pts: string[] =
              (selectedStage?.workOrderId as any)?.acceptancePoints || [];
            if (pts.length === 0) return null;
            return (
              <View style={styles.acceptanceBox}>
                <Text style={styles.acceptanceTitle}>
                  ✅ Acceptance Points to Check
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {pts.map((pt, i) => (
                    <View key={i} style={styles.acceptancePill}>
                      <Text style={styles.acceptancePillText}>✓ {pt}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
              marginTop: 4,
              backgroundColor: extraDetails.isExternalVendor
                ? "#e8f8f6"
                : "transparent",
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: extraDetails.isExternalVendor
                ? "#00877f"
                : "#d7e6e4",
            }}
            onPress={() =>
              setExtraDetails({
                ...extraDetails,
                isExternalVendor: !extraDetails.isExternalVendor,
              })
            }
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderWidth: 2,
                borderColor: "#006b65",
                borderRadius: 6,
                marginRight: 10,
                backgroundColor: extraDetails.isExternalVendor
                  ? "#006b65"
                  : "transparent",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {extraDetails.isExternalVendor && (
                <Text
                  style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}
                >
                  ✓
                </Text>
              )}
            </View>
            <View>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: "#006b65" }}
              >
                Mark as External / Vendor Production
              </Text>
              <Text style={{ fontSize: 11, color: "#5b7773", marginTop: 2 }}>
                Vendor will handle production and supply output quantity.
              </Text>
            </View>
          </TouchableOpacity>

          {extraDetails.isExternalVendor && (
            <FormField label="Select Vendor *" required>
              <Select
                placeholder="Select Vendor"
                value={extraDetails.vendorName}
                options={vendors.map((v) => ({
                  label: `${v.vendorName || "Unnamed"} | ${v.city || "N/A"} | ${v.area || "N/A"}`,
                  value: v.vendorName,
                }))}
                onSelect={(v) =>
                  setExtraDetails({ ...extraDetails, vendorName: v })
                }
              />
            </FormField>
          )}

          {/* Target qty — read-only reference for in-house, editable for external vendor */}
          {extraDetails.isExternalVendor ? (
            <FormField
              label="Target Quantity *"
              containerStyle={{ marginBottom: 16 }}
            >
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                placeholder="Parts to produce"
                value={extraDetails.targetPartCount?.toString()}
                onChangeText={(t) =>
                  setExtraDetails({
                    ...extraDetails,
                    targetPartCount: parseInt(t) || 0,
                  })
                }
              />
            </FormField>
          ) : (
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: "#5b7773",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Target Quantity
                </Text>
                <View
                  style={{
                    backgroundColor: "#edf5f4",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#d7e6e4",
                    padding: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "900",
                      color: "#183f3c",
                    }}
                  >
                    {extraDetails.targetPartCount || 0} pcs
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: "#5b7773",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Planned Start
                </Text>
                <View
                  style={{
                    backgroundColor: "#edf5f4",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#d7e6e4",
                    padding: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#315451",
                    }}
                  >
                    {extraDetails.actualStartDate
                      ? fmtDate(extraDetails.actualStartDate)
                      : "N/A"}
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    color: "#5b7773",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Planned End
                </Text>
                <View
                  style={{
                    backgroundColor: "#edf5f4",
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#d7e6e4",
                    padding: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#315451",
                    }}
                  >
                    {extraDetails.actualEndDate
                      ? fmtDate(extraDetails.actualEndDate)
                      : "N/A"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* REWORK: show weight/price info card */}
          {extraDetails.isRework &&
            (extraDetails.weightPerPart > 0 ||
              extraDetails.pricePerPart > 0) && (
              <View
                style={{
                  marginBottom: 16,
                  backgroundColor: "#f0fdf4",
                  borderRadius: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#bbf7d0",
                }}
              >
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#15803d",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      Weight / Part
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#14532d",
                      }}
                    >
                      {extraDetails.weightPerPart || 0} kg
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: "#15803d",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        marginBottom: 2,
                      }}
                    >
                      Price / Part
                    </Text>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#14532d",
                      }}
                    >
                      ₹{extraDetails.pricePerPart || 0}
                    </Text>
                  </View>
                </View>
              </View>
            )}

          {/* Machine assignments — multi-machine card layout (skip for rework stages) */}
          {!extraDetails.isExternalVendor &&
            isMultiMachineStage &&
            !extraDetails.isRework && (
              <View style={{ marginTop: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: "#183f3c",
                    }}
                  >
                    Machine Assignments
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor:
                          machineRows.reduce(
                            (s, r) => s + (r.targetQuantity || 0),
                            0,
                          ) === (extraDetails.targetPartCount || 0)
                            ? "#dcfce7"
                            : "#fef3c7",
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "800",
                          color:
                            machineRows.reduce(
                              (s, r) => s + (r.targetQuantity || 0),
                              0,
                            ) === (extraDetails.targetPartCount || 0)
                              ? "#166534"
                              : "#b45309",
                        }}
                      >
                        {machineRows.reduce(
                          (s, r) => s + (r.targetQuantity || 0),
                          0,
                        )}{" "}
                        / {extraDetails.targetPartCount || 0} pcs
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: "#00877f",
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                      }}
                      onPress={() =>
                        setMachineRows([
                          ...machineRows,
                          {
                            machineId: "",
                            targetQuantity: 0,
                            operatorId: "",
                            programId: "",
                            startDate: timingData.startDate,
                            endDate: "",
                            shift: "",
                          },
                        ])
                      }
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        + Add Row
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {stageMachines.length === 0 && (
                  <Text
                    style={{ fontSize: 11, color: "#7a9692", marginBottom: 8 }}
                  >
                    No {selectedStage?.type?.replace("_", " ")} machines
                    configured. Check Configuration.
                  </Text>
                )}

                {machineRows.map((row, idx) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#d7e6e4",
                      overflow: "hidden",
                      marginBottom: 10,
                    }}
                  >
                    {/* Card header */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "#f7fbfa",
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderBottomColor: "#d7e6e4",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "#d9f3f0",
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "800",
                              color: "#00877f",
                            }}
                          >
                            ROW #{idx + 1}
                          </Text>
                        </View>
                        {row.machineId && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: "#5b7773",
                              fontWeight: "600",
                            }}
                          >
                            {row.machineId}
                          </Text>
                        )}
                      </View>
                      {machineRows.length > 1 && (
                        <TouchableOpacity
                          onPress={() =>
                            setMachineRows(
                              machineRows.filter((_, i) => i !== idx),
                            )
                          }
                          style={{
                            backgroundColor: "#fee2e2",
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: "#dc2626",
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            ✕ Remove
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={{ padding: 12 }}>
                      {(selectedStage?.type || "").toUpperCase() ===
                      "COATING" ? (
                        /* Coating: Operator | Shift | Qty | Start Date (no machine, no program) */
                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <FormField
                            label="Operator *"
                            style={{ flex: 2, minWidth: 0 }}
                          >
                            <Select
                              placeholder="Select operator"
                              value={row.operatorId}
                              options={operatorOptions}
                              onSelect={(v) => {
                                const updated = [...machineRows];
                                updated[idx] = {
                                  ...updated[idx],
                                  operatorId: v,
                                };
                                setMachineRows(updated);
                              }}
                            />
                          </FormField>
                          <FormField
                            label="Shift *"
                            style={{ flex: 1.5, minWidth: 0 }}
                          >
                            <Select
                              placeholder="Select shift"
                              value={row.shift}
                              options={shifts.map((s) => ({
                                label: s.name,
                                value: s.name,
                              }))}
                              onSelect={(v) => {
                                const updated = [...machineRows];
                                updated[idx] = { ...updated[idx], shift: v };
                                setMachineRows(updated);
                              }}
                            />
                          </FormField>
                          <FormField
                            label="Qty *"
                            style={{ flex: 0.8, minWidth: 0 }}
                          >
                            <TextInput
                              style={inputStyle.input}
                              placeholder="0"
                              keyboardType="numeric"
                              value={
                                row.targetQuantity
                                  ? row.targetQuantity.toString()
                                  : ""
                              }
                              onChangeText={(t) => {
                                const updated = [...machineRows];
                                updated[idx] = {
                                  ...updated[idx],
                                  targetQuantity: parseInt(t) || 0,
                                };
                                setMachineRows(updated);
                              }}
                            />
                          </FormField>
                          <FormField
                            label="Start Date *"
                            style={{ flex: 1.5, minWidth: 0 }}
                          >
                            <DatePicker
                              value={row.startDate || timingData.startDate}
                              onChange={(d) => {
                                const updated = [...machineRows];
                                updated[idx] = {
                                  ...updated[idx],
                                  startDate: d,
                                  endDate: d,
                                };
                                setMachineRows(updated);
                              }}
                              minDate={today}
                            />
                          </FormField>
                        </View>
                      ) : (
                        <>
                          {/* Row A: Machine | Operator | Shift | Qty */}
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 10,
                              marginBottom: 10,
                            }}
                          >
                            <FormField
                              label="Machine *"
                              style={{ flex: 2.5, minWidth: 0 }}
                            >
                              <Select
                                placeholder="Select machine"
                                value={row.machineId}
                                options={stageMachines.map((m) => ({
                                  label: `${m.name} (${m.machineId})${m.isBusy ? " — ⚠️ BUSY" : ""}`,
                                  value: m.machineId,
                                  disabled: m.isBusy,
                                }))}
                                onSelect={(v) => {
                                  const updated = [...machineRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    machineId: v,
                                  };
                                  setMachineRows(updated);
                                }}
                              />
                            </FormField>
                            <FormField
                              label="Operator *"
                              style={{ flex: 2, minWidth: 0 }}
                            >
                              <Select
                                placeholder="Select operator"
                                value={row.operatorId}
                                options={operatorOptions}
                                onSelect={(v) => {
                                  const updated = [...machineRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    operatorId: v,
                                  };
                                  setMachineRows(updated);
                                }}
                              />
                            </FormField>
                            <FormField
                              label="Shift *"
                              style={{ flex: 1.5, minWidth: 0 }}
                            >
                              <Select
                                placeholder="Select shift"
                                value={row.shift}
                                options={shifts.map((s) => ({
                                  label: s.name,
                                  value: s.name,
                                }))}
                                onSelect={(v) => {
                                  const updated = [...machineRows];
                                  updated[idx] = { ...updated[idx], shift: v };
                                  setMachineRows(updated);
                                }}
                              />
                            </FormField>
                            <FormField
                              label="Qty *"
                              style={{ flex: 0.8, minWidth: 0 }}
                            >
                              <TextInput
                                style={inputStyle.input}
                                placeholder="0"
                                keyboardType="numeric"
                                value={
                                  row.targetQuantity
                                    ? row.targetQuantity.toString()
                                    : ""
                                }
                                onChangeText={(t) => {
                                  const updated = [...machineRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    targetQuantity: parseInt(t) || 0,
                                  };
                                  setMachineRows(updated);
                                }}
                              />
                            </FormField>
                          </View>

                          {/* Row B: Program/Model | Start Date */}
                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <FormField
                              label="Program / Model *"
                              style={{ flex: 2, minWidth: 0 }}
                            >
                              <Select
                                placeholder="Select program"
                                value={row.programId}
                                options={programOptions}
                                onSelect={(v) => {
                                  const programDetails =
                                    getProgramStartDetails(v);
                                  const updated = [...machineRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    ...programDetails,
                                    programId: v,
                                  };
                                  setMachineRows(updated);
                                  if (idx === 0) {
                                    setExtraDetails({
                                      ...extraDetails,
                                      programId: v,
                                      totalCycleTimeSeconds:
                                        programDetails.totalCycleTimeSeconds,
                                      selectPartType:
                                        programDetails.selectPartType,
                                      partsType: programDetails.partsType,
                                      partsPerCycle:
                                        programDetails.partsPerCycle,
                                      weightPerPart:
                                        programDetails.weightPerPart ||
                                        extraDetails.weightPerPart ||
                                        0,
                                      pricePerPart:
                                        programDetails.pricePerPart ||
                                        extraDetails.pricePerPart ||
                                        0,
                                    });
                                  }
                                }}
                              />
                            </FormField>
                            <FormField
                              label="Start Date *"
                              style={{ flex: 1.5, minWidth: 0 }}
                            >
                              <DatePicker
                                value={row.startDate || timingData.startDate}
                                onChange={(d) => {
                                  const updated = [...machineRows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    startDate: d,
                                    endDate: d,
                                  };
                                  setMachineRows(updated);
                                }}
                                minDate={today}
                              />
                            </FormField>
                          </View>

                          {/* Material Reconciliation — per machine row, Die Casting only */}
                          {(selectedStage?.type || "").toUpperCase() ===
                            "DIE_CASTING" &&
                            !extraDetails.isRework &&
                            (() => {
                              const rowReqKg = parseFloat(
                                (
                                  (row.targetQuantity || 0) *
                                  (extraDetails.weightPerPart || 0)
                                ).toFixed(3),
                              );
                              const rowBufKg = parseFloat(
                                (
                                  (rowReqKg *
                                    (extraDetails.bufferPercent || 0)) /
                                  100
                                ).toFixed(3),
                              );
                              const rowTotalReq = parseFloat(
                                (rowReqKg + rowBufKg).toFixed(3),
                              );
                              const rowExcess = parseFloat(
                                (
                                  (row.actualMaterialReceivedKg || 0) -
                                  rowTotalReq
                                ).toFixed(3),
                              );
                              return (
                                <View
                                  style={{
                                    marginTop: 10,
                                    padding: 12,
                                    backgroundColor: "#fffbeb",
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: "#fde68a",
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      marginBottom: 8,
                                      gap: 4,
                                    }}
                                  >
                                    <Text style={{ fontSize: 11 }}>⚖️</Text>
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: "800",
                                        color: "#92400e",
                                      }}
                                    >
                                      MATERIAL RECONCILIATION
                                    </Text>
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: "#b45309",
                                        marginLeft: 4,
                                      }}
                                    >
                                      Required: {rowTotalReq} kg
                                    </Text>
                                  </View>
                                  <View
                                    style={{ flexDirection: "row", gap: 10 }}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text
                                        style={{
                                          fontSize: 10,
                                          color: "#b45309",
                                          fontWeight: "700",
                                          marginBottom: 4,
                                        }}
                                      >
                                        ACTUAL RECEIVED (KG) *
                                      </Text>
                                      <TextInput
                                        style={{
                                          backgroundColor: "#fff",
                                          borderWidth: 2,
                                          borderColor: "#fde047",
                                          borderRadius: 8,
                                          padding: 10,
                                          fontSize: 15,
                                          fontWeight: "800",
                                          color: "#183f3c",
                                        }}
                                        keyboardType="decimal-pad"
                                        placeholder="0.00"
                                        value={
                                          row.actualMaterialReceivedKg?.toString() ||
                                          ""
                                        }
                                        onChangeText={(t) => {
                                          const updated = [...machineRows];
                                          updated[idx] = {
                                            ...updated[idx],
                                            actualMaterialReceivedKg:
                                              parseFloat(t) || 0,
                                          };
                                          setMachineRows(updated);
                                        }}
                                      />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                      <Text
                                        style={{
                                          fontSize: 10,
                                          color: "#5b7773",
                                          fontWeight: "700",
                                          marginBottom: 4,
                                        }}
                                      >
                                        CALCULATED EXCESS (KG)
                                      </Text>
                                      <View
                                        style={{
                                          backgroundColor: "#edf5f4",
                                          borderWidth: 1,
                                          borderColor: "#c8dbd8",
                                          borderRadius: 8,
                                          padding: 10,
                                        }}
                                      >
                                        <Text
                                          style={{
                                            fontSize: 15,
                                            fontWeight: "800",
                                            color:
                                              rowExcess < 0
                                                ? "#dc2626"
                                                : "#183f3c",
                                          }}
                                        >
                                          {(row.actualMaterialReceivedKg || 0) >
                                          0
                                            ? rowExcess
                                            : "—"}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              );
                            })()}
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
        </FormModal>

        {/* ── Route Modal ─────────────────────────────────────────────────── */}
        <FormModal
          visible={showRouteModal}
          title="Route Good Parts Forward"
          subtitle="Select the next stage. Only forward stages are available."
          onClose={() => setShowRouteModal(false)}
          onSave={handleRoute}
          saveLabel={
            nextType ? `➔ Route to ${nextType}` : "🏁 Sign-off & Complete WO"
          }
        >
          {/* ── Acceptance Points (from Work Order) ───────────────────────────── */}
          {(() => {
            const pts: string[] =
              (selectedStage?.workOrderId as any)?.acceptancePoints || [];
            if (pts.length === 0) return null;
            return (
              <View style={styles.acceptanceBox}>
                <Text style={styles.acceptanceTitle}>
                  ✅ Acceptance Points Reference
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {pts.map((pt, i) => (
                    <View key={i} style={styles.acceptancePill}>
                      <Text style={styles.acceptancePillText}>✓ {pt}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {selectedStage && (
            <View
              style={{
                borderRadius: 8,
                padding: 12,
                borderWidth: 1,
                borderColor: "#d7e6e4",
                marginBottom: 16,
                backgroundColor: "#f7fbfa",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#315451",
                  marginBottom: 6,
                }}
              >
                📊 Stage Output Summary
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <View
                  style={{
                    backgroundColor: "#dcfce7",
                    borderRadius: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: "#166534",
                    }}
                  >
                    ✅ Good: {selectedStage.goodPartsCount}
                  </Text>
                </View>
                {(selectedStage.reworkPartsCount ?? 0) > 0 && (
                  <View
                    style={{
                      backgroundColor: "#fef9c3",
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: "#92400e",
                      }}
                    >
                      ↩ Rework: {selectedStage.reworkPartsCount} — auto-queued ✓
                    </Text>
                  </View>
                )}
                {(selectedStage.rejectedPartsCount ?? 0) > 0 && (
                  <View
                    style={{
                      backgroundColor: "#fee2e2",
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: "#991b1b",
                      }}
                    >
                      ❌ Rejected: {selectedStage.rejectedPartsCount}
                    </Text>
                  </View>
                )}
              </View>
              {selectedStage.rejectionReasons?.length > 0 && (
                <Text style={{ fontSize: 11, color: "#5b7773", marginTop: 6 }}>
                  Rejection reasons: {selectedStage.rejectionReasons.join(", ")}
                </Text>
              )}
            </View>
          )}

          <FormField label="Where should the good parts go?">
            <View style={{ flexDirection: "column", gap: 10 }}>
              {/* Build forward-only options dynamically */}
              {[
                {
                  val: null,
                  label: "🏁 Complete / Sign-off Work Order",
                  desc: "No further stages needed.",
                },
                ...allProcesses.map((p) => ({
                  val: p.processId,
                  label: p.processName,
                  desc: `Input: ${selectedStage?.goodPartsCount ?? 0} good parts`,
                  order: p.order,
                })),
              ]
                .filter((opt) => {
                  if (!selectedStage) return false;
                  if (opt.val === null) return true;
                  if (opt.val === selectedStage.type) return false;

                  const currentProcess = allProcesses.find(
                    (p) => p.processId === selectedStage.type,
                  );
                  const currentOrder = currentProcess?.order ?? 0;
                  const optOrder = (opt as any).order ?? 0;

                  return optOrder > currentOrder;
                })
                .map((opt, i) => (
                  <TouchableOpacity
                    key={opt.val || "COMPLETE"}
                    style={{
                      padding: 14,
                      borderWidth: 2,
                      borderColor: nextType === opt.val ? "#00877f" : "#d7e6e4",
                      borderRadius: 8,
                      backgroundColor:
                        nextType === opt.val ? "#e8f8f6" : "#ffffff",
                    }}
                    onPress={() => setNextType(opt.val)}
                  >
                    <Text
                      style={{
                        fontWeight: nextType === opt.val ? "700" : "500",
                        color: nextType === opt.val ? "#1e3a8a" : "#486966",
                      }}
                    >
                      {opt.label}
                    </Text>
                    <Text
                      style={{ fontSize: 11, color: "#5b7773", marginTop: 2 }}
                    >
                      {opt.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </FormField>
        </FormModal>

        {/* 4. Journey Timeline Modal */}
        <FormModal
          visible={showJourneyModal}
          title="Production Journey"
          subtitle={`Traceability for ${(selectedStage?.workOrderId as any)?.workOrderId || "Work Order"}`}
          onClose={() => setShowJourneyModal(false)}
          onSave={() => setShowJourneyModal(false)}
          saveLabel="Close"
          hideCancel
          maxWidth={600}
        >
          <View style={{ paddingVertical: 10 }}>
            {journeyStages.map((js, idx) => (
              <View
                key={js._id || js.id}
                style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}
              >
                <View style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor:
                        js.status === "COMPLETED" ? "#22c55e" : "#00877f",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
                    >
                      {idx + 1}
                    </Text>
                  </View>
                  {idx < journeyStages.length - 1 && (
                    <View
                      style={{
                        width: 2,
                        flex: 1,
                        backgroundColor: "#d7e6e4",
                        marginVertical: -8,
                      }}
                    />
                  )}
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: "#f7fbfa",
                    borderRadius: 12,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: "#d7e6e4",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: "#183f3c",
                      }}
                    >
                      {js.type.replace("_", " ")}
                    </Text>
                    <StatusBadge
                      variant={(js.status || "PENDING").toLowerCase()}
                    />
                  </View>
                  <Text
                    style={{ fontSize: 11, color: "#5b7773", marginBottom: 6 }}
                  >
                    {js.createdAt ? fmtDateTime(js.createdAt) : "N/A"}
                  </Text>

                  <View
                    style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}
                  >
                    <View>
                      <Text style={{ fontSize: 10, color: "#7a9692" }}>
                        Input
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: "700" }}>
                        {js.inputQuantity || 0}
                      </Text>
                    </View>
                    {js.goodPartsCount !== undefined && (
                      <View>
                        <Text style={{ fontSize: 10, color: "#16a34a" }}>
                          Good ✓
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#16a34a",
                          }}
                        >
                          {js.goodPartsCount}
                        </Text>
                      </View>
                    )}
                    {js.reworkPartsCount > 0 && (
                      <View>
                        <Text style={{ fontSize: 10, color: "#d97706" }}>
                          Rework ↩
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: "#d97706",
                          }}
                        >
                          {js.reworkPartsCount}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Material Reconciliation Data for Die Casting */}
                  {js.type === "DIE_CASTING" &&
                    (js as any).actualMaterialReceivedKg !== undefined && (
                      <View
                        style={{
                          marginTop: 10,
                          padding: 8,
                          backgroundColor: "#fffbeb",
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: "#fde68a",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: "#92400e",
                            marginBottom: 4,
                          }}
                        >
                          ⚖️ MATERIAL RECONCILIATION
                        </Text>
                        <View style={{ flexDirection: "row", gap: 16 }}>
                          <View>
                            <Text style={{ fontSize: 9, color: "#b45309" }}>
                              Actual Recv
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: "#78350f",
                              }}
                            >
                              {js.actualMaterialReceivedKg} kg
                            </Text>
                          </View>
                          <View>
                            <Text style={{ fontSize: 9, color: "#b45309" }}>
                              Excess
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color:
                                  (js.excessMaterialReceivedKg || 0) < 0
                                    ? "#dc2626"
                                    : "#166534",
                              }}
                            >
                              {js.excessMaterialReceivedKg} kg
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}

                  {js.machineId && (
                    <Text
                      style={{ fontSize: 11, color: "#486966", marginTop: 4 }}
                    >
                      🏭 Machine:{" "}
                      <Text style={{ fontWeight: "700" }}>{js.machineId}</Text>
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </FormModal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf5f4" },
  maxWidth: { width: "100%", alignSelf: "center" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "#d7e6e4",
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: "center",
    marginHorizontal: 2,
  },
  tabActive: { backgroundColor: "#00877f" },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5b7773",
    textTransform: "uppercase",
  },
  tabTextActive: { color: "#ffffff" },
  btnAction: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  btnActionText: { fontSize: 12, fontWeight: "700", color: "#9a3412" },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d7e6e4",
  },
  filterBtnActive: { backgroundColor: "#00877f", borderColor: "#00877f" },
  filterBtnText: { fontSize: 12, fontWeight: "600", color: "#5b7773" },
  filterBtnTextActive: { color: "#ffffff" },
  woRefCard: {
    backgroundColor: "#e8f8f6",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 12,
  },
  woRefTitle: { fontSize: 15, fontWeight: "700", color: "#006b65" },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e6e4",
    backgroundColor: "#f7fbfa",
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: "#00877f", borderColor: "#00877f" },
  modeBtnText: { fontSize: 12, fontWeight: "700", color: "#5b7773" },
  modeBtnTextActive: { color: "#ffffff" },
  machineRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  addMachineBtn: {
    backgroundColor: "#e8f8f6",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderStyle: "dashed",
  },
  addMachineBtnText: { fontSize: 13, fontWeight: "700", color: "#00877f" },
  acceptanceBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#86efac",
    marginBottom: 12,
  },
  acceptanceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#15803d",
  },
  acceptancePill: {
    backgroundColor: "#dcfce7",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#4ade80",
  },
  acceptancePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
});
