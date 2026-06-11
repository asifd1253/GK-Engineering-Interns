export interface RolePermissions {
  dashboard: boolean | string[];
  inventory: boolean | string[];
  schedules: boolean | string[];
  workorders: boolean | string[];
  pipeline: boolean | string[];
  quality: boolean | string[];
  reports: boolean | string[];
  analytics: boolean | string[];
  configuration: boolean | string[];
  clients: boolean | string[];
}

export interface Role {
  _id: string;
  name: string;
  label: string;
  description?: string;
  department?: string;
  permissions: RolePermissions;
  tenantId?: string;
}

export interface User {
  _id?: string;
  id: string;
  username: string;
  password?: string;
  role: string; // dynamic — matches Role.name
  name: string;
  email?: string;
  tenantId?: string;
  tenantName?: string;
  department?: string;
  process?: string; // assigned process (processId), 'ALL', or undefined = all
  permissions: RolePermissions;       // resolved at login from role + overrides
  customPermissions?: RolePermissions | null;
}

export interface RawMaterial {
  _id?: string;
  id?: string;
  materialId: string;
  grade: string;
  receivedQuantity: number;
  dateReceived: string;
  receivedById: string;
  approvedById?: string;
  batchNumber: string;
  numberOfComponents: number;
  weightPerComponentKg: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PARTIAL_REJECT' | 'RETURNED_TO_VENDOR';
  rejectionReason?: string;
  rejectedQuantity?: number;
  usedQuantity?: number;
  consumptionLog?: Array<{
    workOrderId: string;
    quantity: number;
    timestamp: string;
  }>;
  receivedByName?: string;
  approvedByName?: string;
  tenantId?: string;
}

export interface MonthlySchedule {
  _id?: string;
  id?: string;
  serialNumber: string;
  partId: string;
  partName: string;
  requiredQuantity: number;
  date: string;
  materialId?: string;
  grade?: string;
  batchNumber?: string;
  materialReceiptId?: string;
  tenantId?: string;
}

export interface Machine {
  _id?: string;
  id?: string;
  machineId: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'INACTIVE';
  gatewayId?: string;
  plantId?: string;
  tenantId?: string;
}

export interface Shift {
  _id?: string;
  id?: string;
  shiftId: string;
  name: string;
  startTime: string;
  endTime: string;
  startNextDay: boolean;
  endNextDay: boolean;
  breaks: Array<{
    breakName: string;
    breakDuration: string;
    breakStartTime: string;
    breakEndTime: string;
  }>;
  tenantId?: string;
}

export enum WorkOrderStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface WorkOrder {
  _id?: string;
  id?: string;
  workOrderId?: string;
  type?: 'MAIN' | 'SUB' | 'REWORK';
  parentWorkOrderId?: any;
  mainWorkOrderId?: string;
  processType?: string;
  initialStage?: string;
  date: string;
  masterId?: string;
  batchNumber?: string;
  batchDate?: string;
  partId: string;
  partName?: string;
  targetPartCount: number;
  materialGrade: string;
  requiredQuantityKg: number;
  bufferKg?: number;
  isBufferApplied?: boolean;
  shift?: string;
  shifts?: string[];
  shiftId?: string;
  machineId?: string;
  operatorId?: string;
  programId?: string;
  machineAssignments?: Array<{
    machineId: string;
    targetQuantity: number;
    operatorId?: string;
    programId?: string;
    programNumber?: string;
    startDate?: string;
    startTime?: number;
    endDate?: string;
    endTime?: number;
    cycleTime?: number;
    totalCycleTimeSeconds?: number;
    partsPerCycle?: number;
    partsType?: string | number;
    selectPartType?: string | number;
    pricePerPart?: number;
    StartTime?: number;
    EndTime?: number;
    status?: string;
    Status?: string;
    earlyEndReason?: string;
    partCount?: number;
    shiftId?: string;
    CustId?: string;
    PlantId?: string;
    custId?: string;
    plantId?: string;
    tenantId?: string;
    palletCount?: number[];
    totalCount?: number[];
  }>;
  actualTarget?: number;
  partsPerCycle?: number;
  weightPerPart?: number;
  isExternalVendor?: boolean;
  vendorName?: string;
  actualMaterialReceivedKg?: number;
  pricePerPart?: number;
  actualOutput?: number;
  startDate: string;
  endDate?: string;
  acceptancePoints?: string[];
  status: WorkOrderStatus;
  pdcManagerId?: any;
  scheduleId?: string;
  reworkCycle?: number;
  createdAt?: string;
  tenantId?: string;
}

export enum ProcessType {
  DIE_CASTING = 'DIE_CASTING',
  COATING = 'COATING',
  MACHINING = 'MACHINING',
  FINAL_QA = 'FINAL_QA',
}

export enum ProcessStageStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  READY_FOR_QI = 'READY_FOR_QI',
  QI_SUBMITTED = 'QI_SUBMITTED',
  PDC_VERIFIED = 'PDC_VERIFIED',
  COMPLETED = 'COMPLETED',
}

export interface ProcessStage {
  _id?: string;
  id?: string;
  workOrderId: any;
  workOrderNumber?: string;
  workOrderType?: string;
  mainWorkOrderId?: string;
  masterId?: string;
  partId?: string;
  type: ProcessType;
  status: ProcessStageStatus;
  plannedTiming?: string;
  inputQuantity: number;
  outputQuantity?: number;
  outputCount?: number;
  goodPartsCount: number;
  reworkPartsCount: number;
  rejectedPartsCount: number;
  scrapWeightKg: number;
  outputWeightKg?: number;
  calculatedWeightPerPart?: number;
  rejectionReasons: { reason: string; count: number }[];
  reworkReasons: { reason: string; count: number }[];
  scrapReasons?: string[];
  operatorId?: string;
  machineId?: string;
  machineAssignments?: Array<{
    machineId: string;
    qty: number;
    startDate?: string;
    startTime?: number;
    endDate?: string;
    endTime?: number;
    programId?: string;
    cycleTime?: number;
    totalCycleTimeSeconds?: number;
    partsPerCycle?: number;
    partsType?: string | number;
    selectPartType?: string | number;
    pricePerPart?: number;
    StartTime?: number;
    EndTime?: number;
    status?: string;
    Status?: string;
    shiftId?: string;
    CustId?: string;
    PlantId?: string;
    custId?: string;
    plantId?: string;
    tenantId?: string;
    partCount?: number;
    palletCount?: number[];
    totalCount?: number[];
  }>;
  qiUserId?: any;
  pdcUserId?: any;
  reworkCycle?: number;
  parentStageId?: string;
  stageLog?: Array<{
    action: string;
    actorId: string;
    actorName?: string;
    timestamp: string;
    note?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface QualityInspection {
  id: string;
  date: string;
  masterId: string;
  partId: string;
  shift: string;
  machine: string;
  producedCount: number;
  goodCount: number;
  reworkCount: number;
  reworkReasons: { reason: string; count: number }[];
  rejectedCount: number;
  rejectionReasons: { reason: string; count: number }[];
  inspectedBy: string;
  type: 'in_process' | 'final';
  status: 'pending' | 'approved' | 'rejected';
}

export interface DashboardData {
  totalRawMaterials: number;
  totalReceivedKg?: number;
  totalUsedKg?: number;
  remainingKg?: number;
  totalWorkOrders: number;
  activeWorkOrders: number;
  totalInspections: number;
  totalScrap: number;
  totalProduced?: number;
  totalGood?: number;
  totalRework?: number;
  totalRejected?: number;
}

export interface AcceptancePoint {
  _id?: string;
  id?: string;
  point: string;
}
