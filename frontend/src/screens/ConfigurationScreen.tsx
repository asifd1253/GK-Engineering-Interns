import { DataStorage, API_BASE_URL, fmtDate } from "../utils/storage";
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { User, Role, Machine, Shift, AcceptancePoint } from "../types";
import {
  DataTable,
  Column,
  PageHeader,
  StatusBadge,
  FormModal,
  FormField,
  inputStyle,
  Select,
} from "../components";
import { PermissionsGrid } from "../components/PermissionsGrid";
import { useToast, useConfirm, useAuth } from "../context";
import { can } from "../utils/permissions";

const DEFAULT_ROLE_COLORS: Record<string, string> = {
  admin: "#00877f",
  storekeeper: "#059669",
  inventory_user: "#059669",
  pdc: "#7c3aed",
  pdc_manager: "#7c3aed",
  qi: "#ea580c",
  qi_user: "#ea580c",
  fqi: "#be185d",
  final_qi: "#be185d",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_NAME_RE = /^[a-z][a-z0-9_]{2,39}$/;

const ALGORITHM_OPTIONS = [
  { label: "0 — Undefined", value: 0 },
  { label: "1 — 1x Digital Pin Based", value: 1 },
  { label: "2 — 2x Digital Pin Based", value: 2 },
  { label: "3 — 3x Digital Pin Based", value: 3 },
  { label: "4 — CT with Threshold", value: 4 },
  { label: "5 — CT with Variation", value: 5 },
  { label: "255 — Cloud Based", value: 255 },
];

const GATEWAY_COMMANDS = [
  { label: "Factory Reset", value: "RESET:FACTORY" },
  { label: "Gateway Reset", value: "RESET:GATEWAY" },
  { label: "Clear Running Config", value: "RESET:CONFIG" },
  { label: "Reset Digital Output", value: "RESET:OUTPIN" },
  { label: "Trigger OTA", value: "SET:OTA" },
  { label: "Switch ON Out Pin", value: "SET:OUTPIN" },
  { label: "Enable Log Level", value: "SET:LOG" },
];
const PartCount_OPTIONS = [
  { label: "Digital", value: "0" },
  { label: "AI", value: "1" },
  { label: "Others", value: "3" },
];
const AI_CHANNEL_OPTIONS = [
  { label: "AI1", value: "ai1" },
  { label: "AI2", value: "ai2" },
];
const OTH_CHANNEL_OPTIONS = [
  { label: "OTH1", value: "oth1" },
  { label: "OTH2", value: "oth2" },
];
const gatewayTypeOptions = [
  { label: "Edj10", value: "10" },
  { label: "Edj20", value: "20" },
];

const LICENSING_OPTIONS = [
  { label: "1 Month", value: "1 months" },
  { label: "3 Months", value: "3 months" },
  { label: "6 Months", value: "6 months" },
  { label: "1 Year", value: "1 year" },
];

const CONFIG_TABS = [
  { id: "users", label: "Users", permission: "view_users" },
  { id: "roles", label: "Role Types", permission: "view_roles" },
  { id: "devices", label: "Devices", permission: "view_devices" },
  { id: "shifts", label: "Shifts", permission: "view_shifts" },
  { id: "ota", label: "OTA", permission: "view_ota" },
  { id: "departments", label: "Dept", permission: "view_dept" },
  { id: "machineTypes", label: "Mach.Type", permission: "view_machine_type" },
  { id: "reasons", label: "Reasons", permission: "view_reasons" },
  {
    id: "acceptance",
    label: "Acceptance",
    permission: "view_acceptance_points",
  },
  { id: "processes", label: "Process", permission: "view_process" },
  { id: "programMaster", label: "Prg.Master", permission: "view_program" },
  { id: "vendors", label: "Vendors", permission: "view_vendor" },
  { id: "operators", label: "Operators", permission: "view_operator" },
  { id: "materials", label: "Material", permission: "view_material" },
  { id: "parts", label: "Parts", permission: "view_part" },
];

function resolveRolePermissions(
  perms: any,
  moduleDefs: { key: string; actions: string[] }[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const mod of moduleDefs) {
    const val = perms?.[mod.key];
    if (val === true) result[mod.key] = [...mod.actions];
    else if (Array.isArray(val) && val.length > 0) result[mod.key] = [...val];
    else result[mod.key] = [];
  }
  return result;
}

const DAY_MINUTES = 24 * 60;
const FULL_DAY_SHIFT_COVERAGE_MINUTES = DAY_MINUTES - 1;

function timeToMinutes(time?: string): number | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getShiftDurationMinutes(shift: any): number {
  const start = timeToMinutes(shift?.startTime);
  let end = timeToMinutes(shift?.endTime);
  if (start === null || end === null) return 0;
  if (shift?.endNextDay) end += DAY_MINUTES;
  if (end <= start) return 0;
  return end - start;
}

export function ConfigurationScreen() {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const { refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<
    | "users"
    | "roles"
    | "devices"
    | "shifts"
    | "acceptance"
    | "ota"
    | "departments"
    | "machineTypes"
    | "reasons"
    | "processes"
    | "programMaster"
    | "vendors"
    | "operators"
    | "materials"
    | "parts"
  >("users");
  const [acceptancePoints, setAcceptancePoints] = useState<AcceptancePoint[]>(
    [],
  );
  const [moduleDefs, setModuleDefs] = useState<any[]>([]);
  const [newPointText, setNewPointText] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // New States
  const [devices, setDevices] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [otaConfigs, setOtaConfigs] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [machineTypes, setMachineTypes] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [processes, setProcesses] = useState<any[]>([]);
  const [programMasters, setProgramMasters] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);

  const [deviceConfigData, setDeviceConfigData] = useState<any>({
    avbFactor: { type: "SINGLE", value: 0, factors: [] },
    performanceFactor: { type: "SINGLE", value: 0, factors: [] },
    INPin: { type: "SINGLE", value: 0, factors: [] },
    eMICConfig: { value: 0 },
  });

  const [showModal, setShowModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const [formData, setFormData] = useState<Partial<User>>({});
  const [roleFormData, setRoleFormData] = useState<Partial<Role>>({});
  const [machineFormData, setMachineFormData] = useState<any>({});
  const [shiftFormData, setShiftFormData] = useState<any>({});
  const configuredShiftMinutes = shifts.reduce(
    (total, shift) => total + getShiftDurationMinutes(shift),
    0,
  );
  const canAddAnotherShift =
    configuredShiftMinutes < FULL_DAY_SHIFT_COVERAGE_MINUTES;

  // Modal visibility states
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showDeviceConfigModal, setShowDeviceConfigModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [showOTAModal, setShowOTAModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showMachineTypeModal, setShowMachineTypeModal] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showOperatorModal, setShowOperatorModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [showPartModal, setShowPartModal] = useState(false);

  // Form Data for new modules
  const [deviceFormData, setDeviceFormData] = useState<any>({
    custId: "",
    plantId: "",
    gatewayId: "",
    gatewayName: "",
    licensing: "",
    gatewayType: "10",
    partCountType: "0",
    avbFactor: {
      enabled: 0,
      postTime: 10,
      algorithm: 1,
      dutyCyc: 60,
      runDur: 60,
      interlock: 1,
      dep: [],
    },
    performanceFactor: {
      enabled: 0,
      postTime: 30,
      algorithm: [0],
      debounceTime: 0,
      dep: [],
    },
    INPin: { enabled: 1, scanTime: 10, postTime: 10 },
    eMICConfig: {
      enabled: 1,
      postTime: 10,
      freq: 0,
      phaseSeq: 1,
      cngfFactor: [],
    },
  });
  const [gatewayFormData, setGatewayFormData] = useState<any>({});
  const [otaFormData, setOtaFormData] = useState<any>({});
  const [deptFormData, setDeptFormData] = useState<any>({});
  const [mtFormData, setMtFormData] = useState<any>({});
  const [reasonFormData, setReasonFormData] = useState<any>({});
  const [processFormData, setProcessFormData] = useState<any>({});
  const [programFormData, setProgramFormData] = useState<any>({});
  const [vendorFormData, setVendorFormData] = useState<any>({});
  const [operatorFormData, setOperatorFormData] = useState<any>({});
  const [materialFormData, setMaterialFormData] = useState<any>({});
  const [partFormData, setPartFormData] = useState<any>({});

  const [editId, setEditId] = useState<string | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const getNextPlantId = (deviceList: any[]) => {
    if (!deviceList || deviceList.length === 0) return "PLANT001";
    const ids = deviceList.map((d) => {
      const match = d.plantId?.match(/PLANT(\d+)/i);
      return match ? parseInt(match[1], 10) : 0;
    });
    const max = Math.max(...ids, 0);
    return `PLANT${String(max + 1).padStart(3, "0")}`;
  };

  const getPartCountTypeValue = (
    value = deviceFormData.partCountType,
    fallbackAlgorithm = deviceFormData.performanceFactor?.algorithm,
  ) => {
    const fallback = Array.isArray(fallbackAlgorithm)
      ? fallbackAlgorithm[0]
      : 0;
    return Number(value ?? fallback ?? 0);
  };

  const getDigitalPinCount = (value = deviceFormData.gatewayType) => {
    const gatewayType = Number(value);
    return gatewayType === 20 || gatewayType === 8 ? 8 : 4;
  };

  const getDigitalPinOptions = () => {
    const pinCount = getDigitalPinCount();
    return Array.from({ length: pinCount }, (_, index) => ({
      label: `Pin ${index + 1}`,
      value: index + 1,
    }));
  };

  const getPerformanceAlgorithmValues = () => {
    const currentAlgorithm = deviceFormData.performanceFactor?.algorithm;
    return Array.isArray(currentAlgorithm) ? currentAlgorithm : [];
  };

  const getSelectedDigitalPins = (
    algorithm = getPerformanceAlgorithmValues(),
    gatewayType = deviceFormData.gatewayType,
  ) => {
    const pinCount = getDigitalPinCount(gatewayType);
    const tail = (Array.isArray(algorithm) ? algorithm : []).slice(1);
    const tailAsNumbers = tail.map((value: any) => Number(value));

    if (
      tailAsNumbers.length === pinCount &&
      tailAsNumbers.every((value) => value === 0 || value === 1)
    ) {
      return tailAsNumbers
        .map((isSelected, index) => (isSelected === 1 ? index + 1 : null))
        .filter((value): value is number => value !== null);
    }

    return Array.from(
      new Set(tailAsNumbers.filter((value) => value >= 1 && value <= pinCount)),
    ).sort((a, b) => a - b);
  };

  const withPartCountTypeAlgorithm = (
    algorithm: any[],
    partCountType = getPartCountTypeValue(),
  ) => [partCountType, ...(Array.isArray(algorithm) ? algorithm.slice(1) : [])];

  const normalizeDevicePerformanceAlgorithm = (data: any) => {
    const partCountType = getPartCountTypeValue(
      data.partCountType,
      data.performanceFactor?.algorithm,
    );
    const algorithm = Array.isArray(data.performanceFactor?.algorithm)
      ? data.performanceFactor.algorithm
      : [];
    const tail =
      partCountType === 0
        ? getSelectedDigitalPins(algorithm, data.gatewayType)
        : algorithm
            .slice(1)
            .filter(
              (value: any) =>
                value !== undefined && value !== null && value !== "",
            );

    return {
      ...data,
      partCountType: String(partCountType),
      performanceFactor: {
        ...data.performanceFactor,
        algorithm: [partCountType, ...tail],
      },
    };
  };

  const updatePerformanceAlgorithm = (algorithm: any[]) => {
    setDeviceFormData({
      ...deviceFormData,
      performanceFactor: {
        ...deviceFormData.performanceFactor,
        algorithm: withPartCountTypeAlgorithm(algorithm),
      },
    });
  };

  const handlePartCountTypeSelect = (value: any) => {
    const partCountType = Number(value);
    setDeviceFormData({
      ...deviceFormData,
      partCountType: value,
      performanceFactor: {
        ...deviceFormData.performanceFactor,
        algorithm: [partCountType],
      },
    });
  };

  const handleDigitalPinToggle = (pin: number) => {
    const partCountType = getPartCountTypeValue();
    const selectedPins = getSelectedDigitalPins();
    const nextPins = selectedPins.includes(pin)
      ? selectedPins.filter((value) => value !== pin)
      : [...selectedPins, pin].sort((a, b) => a - b);
    updatePerformanceAlgorithm([partCountType, ...nextPins]);
  };

  const handleSinglePartCountInputSelect = (value: any) => {
    updatePerformanceAlgorithm([getPartCountTypeValue(), value]);
  };
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [
        userList,
        roleList,
        machineList,
        shiftList,
        apList,
        defsList,
        user,
        dev,
        gw,
        ota,
        dep,
        mt,
        re,
        pr,
        pm,
        ven,
        ope,
        mats,
        pts,
      ] = await Promise.all([
        DataStorage.getUsers(),
        DataStorage.getRoles(),
        DataStorage.getMachines(),
        DataStorage.getShifts(),
        DataStorage.getAcceptancePoints(),
        DataStorage.getPermissionDefs(),
        DataStorage.getCurrentUser(),
        DataStorage.getDevices(),
        DataStorage.getGatewaysMaster(),
        DataStorage.getOTAConfigs(),
        DataStorage.getDepartments(),
        DataStorage.getMachineTypes(),
        DataStorage.getReasons(),
        DataStorage.getProcesses(),
        DataStorage.getProgramMasters(),
        DataStorage.getVendors(),
        DataStorage.getAllOperators(),
        DataStorage.getMaterials(),
        DataStorage.getParts(),
      ]);
      setUsers(userList);

      // Filter out system-level roles from the list if not a super admin
      const isSuper =
        user?.role === "super_admin" || user?.role === "SUPER_ADMIN";
      const filteredRoles = isSuper
        ? roleList
        : roleList.filter(
            (r) =>
              r.name !== "super_admin" &&
              r.name !== "SUPER_ADMIN" &&
              r.name !== "admin" &&
              r.name !== "ADMIN",
          );

      setRoles(filteredRoles);
      setMachines(machineList);
      setShifts(shiftList);
      setAcceptancePoints(apList);
      setModuleDefs(defsList || []);
      setCurrentUser(user);
      setDevices(dev);
      setGateways(gw);
      setOtaConfigs(ota);
      setDepartments(dep);
      setMachineTypes(mt);
      setReasons(re);
      setProcesses(pr);
      setProgramMasters(pm);
      setVendors(ven);
      setOperators(ope || []);
      setMaterials(mats || []);
      setParts(pts || []);

      if (user) {
        setDeviceFormData((prev) => ({
          ...prev,
          custId: user.tenantId || "CUST001",
          plantId: (user as any).plantId || "PLANT001",
          parentKey:
            (user as any).parentKey || "d62bf63dcd169919f05f16a619f3818f",
        }));

        // Ensure activeTab is accessible
        const currentTabDef = CONFIG_TABS.find((t) => t.id === activeTab);
        if (
          !currentTabDef ||
          !can(user, "configuration", currentTabDef.permission)
        ) {
          const firstAllowed = CONFIG_TABS.find((t) =>
            can(user, "configuration", t.permission),
          );
          if (firstAllowed) {
            setActiveTab(firstAllowed.id as any);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load config data:", e);
    }
  };

  const openAdd = () => {
    setFormData({});
    setEditId(null);
    setShowUserPassword(false);
    setShowRolePicker(false);
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    const rolePerms =
      roles.find((r) => r.name === user.role)?.permissions || {};
    const saved = user.customPermissions as any;
    // Use saved permissions if admin has previously saved customisations (even all-disabled),
    // otherwise fall back to role defaults so the first edit shows the role highlighted.
    const hasCustom =
      saved != null &&
      typeof saved === "object" &&
      Object.keys(saved).length > 0;
    const basePerms = hasCustom ? saved : rolePerms;
    setFormData({
      ...user,
      password: "",
      customPermissions: resolveRolePermissions(basePerms, moduleDefs),
    });
    setEditId(user.id);
    setShowUserPassword(false);
    setShowRolePicker(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    const name = String(formData.name || "").trim();
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    const role = String(formData.role || "").trim();
    const password = String(formData.password || "");
    const process = String(formData.process || "").trim();

    if (!name || !email || !role) {
      showToast({
        message: "Full name, email and role are required.",
        type: "warning",
      });
      return;
    }

    if (name.length < 2 || name.length > 80) {
      showToast({
        message: "Full name must be 2 to 80 characters.",
        type: "warning",
      });
      return;
    }

    if (!EMAIL_RE.test(email)) {
      showToast({ message: "Enter a valid email address.", type: "warning" });
      return;
    }

    if (!roles.some((r) => r.name === role)) {
      showToast({ message: "Select a valid role.", type: "warning" });
      return;
    }

    if (!editId && !password) {
      showToast({
        message: "Password is required for new users.",
        type: "warning",
      });
      return;
    }

    if (
      process &&
      process !== "ALL" &&
      !processes.some((p) => p.processId === process)
    ) {
      showToast({
        message: "Select a valid assigned process.",
        type: "warning",
      });
      return;
    }

    const normalizedEditId = String(editId || "");
    const duplicateEmail = users.some((user) => {
      const userId = String(user.id || user._id || "");
      return (
        userId !== normalizedEditId &&
        String(user.email || user.username || "")
          .trim()
          .toLowerCase() === email
      );
    });

    if (duplicateEmail) {
      showToast({
        message: "A user with this email already exists.",
        type: "error",
      });
      return;
    }

    const payload = {
      ...formData,
      name,
      username: email,
      email,
      role,
      process: process || undefined,
      password: password || undefined,
      customPermissions: formData.customPermissions || null,
    };

    let saved;
    if (editId) {
      saved = await DataStorage.updateUser(editId, payload);
    } else {
      saved = await DataStorage.createUser(payload);
    }
    if (saved) {
      await loadData();
      if (editId === currentUser?.id) {
        await refreshUser();
      }
      setShowModal(false);
      setFormData({});
      setEditId(null);
      setShowUserPassword(false);
      setShowRolePicker(false);
      showToast({ message: "User saved successfully.", type: "success" });
    } else {
      showToast({ message: "Failed to save user.", type: "error" });
    }
  };

  const handleSaveRole = async () => {
    const name = String(roleFormData.name || "")
      .trim()
      .toLowerCase();
    const label = String(roleFormData.label || "").trim();
    const description = String(roleFormData.description || "").trim();
    const permissions = roleFormData.permissions || {};

    if (!name || !label) {
      showToast({
        message: "Role Name and Label are required.",
        type: "warning",
      });
      return;
    }

    if (!ROLE_NAME_RE.test(name)) {
      showToast({
        message:
          "Role ID must start with a letter and use 3 to 40 lowercase letters, numbers or underscores.",
        type: "warning",
      });
      return;
    }

    if (label.length < 2 || label.length > 80) {
      showToast({
        message: "Display label must be 2 to 80 characters.",
        type: "warning",
      });
      return;
    }

    const isSuper =
      currentUser?.role === "super_admin" ||
      currentUser?.role === "SUPER_ADMIN";
    const blockedNames = ["super_admin", "superadmin", "admin"];
    if (!isSuper && blockedNames.includes(name)) {
      showToast({
        message: "You do not have permission to create a System-level role.",
        type: "error",
      });
      return;
    }

    const duplicateRole = roles.some((role) => {
      const roleId = String(role._id || "");
      if (editId && roleId === String(editId)) return false;
      return (
        String(role.name || "")
          .trim()
          .toLowerCase() === name ||
        String(role.label || "")
          .trim()
          .toLowerCase() === label.toLowerCase()
      );
    });

    if (duplicateRole) {
      showToast({
        message: "Role ID or display label already exists.",
        type: "error",
      });
      return;
    }

    const hasAnyPermission = Object.values(
      permissions as Record<string, any>,
    ).some((value) => (Array.isArray(value) ? value.length > 0 : !!value));

    if (!hasAnyPermission) {
      showToast({
        message: "Select at least one permission for this role.",
        type: "warning",
      });
      return;
    }

    const payload = {
      ...roleFormData,
      name,
      label,
      description,
      permissions,
    };

    let saved;
    if (editId) {
      saved = await DataStorage.updateRole(editId, payload);
    } else {
      saved = await DataStorage.createRole(payload);
    }

    if (saved) {
      await loadData();
      setShowRoleModal(false);
      setRoleFormData({});
      setEditId(null);
      showToast({ message: "Role saved successfully.", type: "success" });
    } else {
      showToast({ message: "Failed to save role.", type: "error" });
    }
  };

  const handleSaveMachine = async () => {
    if (
      !machineFormData.machineId ||
      !machineFormData.name ||
      !machineFormData.type
    ) {
      showToast({
        message: "ID, Name and Type are required.",
        type: "warning",
      });
      return;
    }

    try {
      let saved;
      if (machineFormData._id) {
        saved = await DataStorage.updateMachine(
          machineFormData._id,
          machineFormData,
        );
      } else {
        saved = await DataStorage.createMachine(machineFormData);
      }

      if (saved) {
        await loadData();
        setShowMachineModal(false);
        setMachineFormData({});
        showToast({ message: "Machine saved successfully.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save machine.",
        type: "error",
      });
    }
  };

  const handleSaveShift = async () => {
    if (
      !shiftFormData.name ||
      !shiftFormData.startTime ||
      !shiftFormData.endTime
    ) {
      showToast({
        message: "Name, Start Time and End Time are required.",
        type: "warning",
      });
      return;
    }

    // Validation: Total shift time <= 24 hours
    const toMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const start = toMin(shiftFormData.startTime);
    let end = toMin(shiftFormData.endTime);
    if (shiftFormData.endNextDay) end += 24 * 60;

    if (end - start > 24 * 60) {
      showToast({
        message: "Shift duration cannot exceed 24 hours.",
        type: "error",
      });
      return;
    }
    if (end <= start) {
      showToast({
        message: 'End time must be after start time (check "Ends Next Day").',
        type: "error",
      });
      return;
    }

    // Check for break overlaps
    const breaks = shiftFormData.breaks || [];
    const timeRE = /^\d{1,2}:\d{2}$/;
    for (let i = 0; i < breaks.length; i++) {
      const b1 = breaks[i];
      if (!b1.breakName?.trim()) {
        showToast({
          message: `Break #${i + 1}: Break Name is required.`,
          type: "warning",
        });
        return;
      }
      if (
        !timeRE.test(b1.breakStartTime || "") ||
        !timeRE.test(b1.breakEndTime || "")
      ) {
        showToast({
          message: `Break "${b1.breakName}": start and end times must be in HH:mm format (e.g. 08:30).`,
          type: "error",
        });
        return;
      }
      if (b1.breakStartTime === b1.breakEndTime) {
        showToast({
          message: `Break "${b1.breakName}": start and end time cannot be the same.`,
          type: "error",
        });
        return;
      }
      const b1StartRaw = toMin(b1.breakStartTime);
      let b1EndRaw = toMin(b1.breakEndTime);
      if (b1EndRaw < b1StartRaw) b1EndRaw += 24 * 60;

      let b1Start = b1StartRaw;
      let b1End = b1EndRaw;

      // Handle overnight shift breaks: if break start is numerically before shift start,
      // but shift crosses midnight, it might be in the next day portion.
      if (shiftFormData.endNextDay && b1Start < start) {
        b1Start += 24 * 60;
        b1End += 24 * 60;
      }

      if (b1Start < start || b1End > end) {
        showToast({
          message: `Break "${b1.breakName || "Unnamed"}" (${b1.breakStartTime} - ${b1.breakEndTime}) is outside shift hours (${shiftFormData.startTime} - ${shiftFormData.endTime}${shiftFormData.endNextDay ? " next day" : ""}).`,
          type: "error",
        });
        return;
      }

      for (let j = i + 1; j < breaks.length; j++) {
        const b2 = breaks[j];
        const b2StartRaw = toMin(b2.breakStartTime);
        let b2EndRaw = toMin(b2.breakEndTime);
        if (b2EndRaw < b2StartRaw) b2EndRaw += 24 * 60;

        let b2Start = b2StartRaw;
        let b2End = b2EndRaw;
        if (shiftFormData.endNextDay && b2Start < start) {
          b2Start += 24 * 60;
          b2End += 24 * 60;
        }

        if (b1Start < b2End && b1End > b2Start) {
          showToast({
            message: `Breaks "${b1.breakName}" and "${b2.breakName}" overlap.`,
            type: "error",
          });
          return;
        }
      }
    }

    // Check for duplicate name, shiftId, and time overlap against existing shifts
    const editingId = shiftFormData._id;
    for (const existing of shifts) {
      if (editingId && existing._id === editingId) continue; // skip self when editing

      if (
        existing.name?.toLowerCase().trim() ===
        shiftFormData.name?.toLowerCase().trim()
      ) {
        showToast({
          message: `A shift named "${existing.name}" already exists.`,
          type: "error",
        });
        return;
      }

      if (
        shiftFormData.shiftId &&
        existing.shiftId &&
        existing.shiftId.toLowerCase().trim() ===
          shiftFormData.shiftId.toLowerCase().trim()
      ) {
        showToast({
          message: `Shift ID "${existing.shiftId}" is already in use.`,
          type: "error",
        });
        return;
      }

      if (existing.startTime && existing.endTime) {
        const exStart = toMin(existing.startTime);
        let exEnd = toMin(existing.endTime);
        if (existing.endNextDay) exEnd += 24 * 60;
        // Overlap: two ranges overlap when start_a < end_b AND end_a > start_b
        if (start < exEnd && end > exStart) {
          showToast({
            message: `Shift time (${shiftFormData.startTime}–${shiftFormData.endTime}) overlaps with "${existing.name}" (${existing.startTime}–${existing.endTime}${existing.endNextDay ? " next day" : ""}).`,
            type: "error",
          });
          return;
        }
      }
    }

    try {
      let saved;
      if (shiftFormData._id) {
        saved = await DataStorage.updateShift(shiftFormData._id, shiftFormData);
      } else {
        saved = await DataStorage.createShift(shiftFormData);
      }

      if (saved) {
        await loadData();
        setShowShiftModal(false);
        setShiftFormData({});
        showToast({ message: "Shift saved successfully.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save shift.",
        type: "error",
      });
    }
  };

  const handleSaveDevice = async () => {
    if (isViewOnly) {
      setShowDeviceModal(false);
      return;
    }

    if (!deviceFormData.gatewayId?.trim()) {
      showToast({ message: "Gateway ID is required.", type: "warning" });
      return;
    }
    if (!deviceFormData.gatewayName?.trim()) {
      showToast({ message: "Gateway Name is required.", type: "warning" });
      return;
    }
    if (!deviceFormData.licensing) {
      showToast({ message: "Licensing is required.", type: "warning" });
      return;
    }
    if (!(deviceFormData.avbFactor?.dep?.length > 0)) {
      showToast({
        message: "Availability Factor: at least one DEP value is required.",
        type: "warning",
      });
      return;
    }
    if (!(deviceFormData.performanceFactor?.dep?.length > 0)) {
      showToast({
        message: "Performance Factor: at least one DEP value is required.",
        type: "warning",
      });
      return;
    }
    if (!(deviceFormData.eMICConfig?.cngfFactor?.length > 0)) {
      showToast({
        message:
          "eMIC Config: at least one Configuration Factor value is required.",
        type: "warning",
      });
      return;
    }

    let saved;
    const payload = normalizeDevicePerformanceAlgorithm(deviceFormData);
    if (payload._id)
      saved = await DataStorage.updateDevice(payload._id, payload);
    else saved = await DataStorage.createDevice(payload);
    if (saved) {
      await loadData();
      setShowDeviceModal(false);
      setDeviceFormData({});
      showToast({ message: "Device saved.", type: "success" });
    } else showToast({ message: "Failed to save device.", type: "error" });
  };

  const handleSaveGateway = async () => {
    let saved;
    if (gatewayFormData._id)
      saved = await DataStorage.updateGatewayMaster(
        gatewayFormData._id,
        gatewayFormData,
      );
    else saved = await DataStorage.createGatewayMaster(gatewayFormData);
    if (saved) {
      await loadData();
      setShowGatewayModal(false);
      setGatewayFormData({});
      showToast({ message: "Gateway saved.", type: "success" });
    } else showToast({ message: "Failed to save gateway.", type: "error" });
  };

  const handleSaveOTA = async () => {
    if (!otaFormData.fileName?.trim()) {
      showToast({ message: "File Name is required.", type: "warning" });
      return;
    }
    if (!otaFormData.version?.trim()) {
      showToast({ message: "Version is required.", type: "warning" });
      return;
    }
    if (!otaFormData._id && !otaFormData._selectedFile) {
      showToast({
        message: "Please select a .bin file to upload.",
        type: "warning",
      });
      return;
    }
    try {
      let saved;
      if (otaFormData._selectedFile) {
        saved = await DataStorage.uploadOTAFile(
          otaFormData._selectedFile,
          otaFormData.fileName.trim(),
          otaFormData.version.trim(),
        );
      } else {
        saved = await DataStorage.updateOTAConfig(otaFormData._id, {
          fileName: otaFormData.fileName,
          version: otaFormData.version,
        });
      }
      if (saved) {
        await loadData();
        setShowOTAModal(false);
        setOtaFormData({});
        showToast({
          message: "OTA file uploaded successfully.",
          type: "success",
        });
      } else {
        showToast({ message: "Failed to save OTA.", type: "error" });
      }
    } catch (e: any) {
      showToast({ message: e?.message || "Upload failed.", type: "error" });
    }
  };

  const handleSaveDept = async () => {
    if (!deptFormData.departmentId?.trim()) {
      showToast({ message: "Dept ID is required.", type: "warning" });
      return;
    }
    if (!deptFormData.departmentName?.trim()) {
      showToast({ message: "Department Name is required.", type: "warning" });
      return;
    }
    try {
      let saved;
      if (deptFormData._id)
        saved = await DataStorage.updateDepartment(
          deptFormData._id,
          deptFormData,
        );
      else saved = await DataStorage.createDepartment(deptFormData);
      if (saved) {
        await loadData();
        setShowDeptModal(false);
        setDeptFormData({});
        showToast({ message: "Department saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save department.",
        type: "error",
      });
    }
  };

  const handleSaveMachineType = async () => {
    if (!mtFormData.processCategory) {
      showToast({ message: "Process Category is required.", type: "warning" });
      return;
    }
    if (!mtFormData.machineType?.trim()) {
      showToast({
        message: "Machine Type / Model Name is required.",
        type: "warning",
      });
      return;
    }
    try {
      let saved;
      if (mtFormData._id)
        saved = await DataStorage.updateMachineType(mtFormData._id, mtFormData);
      else saved = await DataStorage.createMachineType(mtFormData);
      if (saved) {
        await loadData();
        setShowMachineTypeModal(false);
        setMtFormData({});
        showToast({ message: "Machine type saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save machine type.",
        type: "error",
      });
    }
  };

  const handleSaveReason = async () => {
    if (!reasonFormData.category) {
      showToast({ message: "Category is required.", type: "warning" });
      return;
    }
    const reasonProcess =
      reasonFormData.type ||
      reasonFormData.processType ||
      reasonFormData.processCategory ||
      reasonFormData.stageType;
    if (!reasonProcess) {
      showToast({
        message: "Applicable Process is required.",
        type: "warning",
      });
      return;
    }
    if (!reasonFormData.reason?.trim()) {
      showToast({
        message: "Reason Description is required.",
        type: "warning",
      });
      return;
    }
    if (reasonFormData.requiresSubReason) {
      const subs = reasonFormData.subReason || [];
      if (subs.length === 0) {
        showToast({
          message:
            'Add at least one Sub-Reason or uncheck "Requires Sub-Reason".',
          type: "warning",
        });
        return;
      }
      if (subs.some((sr: any) => !sr.label?.trim())) {
        showToast({
          message: "All Sub-Reason rows must have a label.",
          type: "warning",
        });
        return;
      }
    }
    try {
      const payload = {
        ...reasonFormData,
        subReasons: (reasonFormData.subReason || []).map((sr: any) => ({
          subReason: sr.label || "",
          subReasonCode:
            sr.value || (sr.label || "").toUpperCase().replace(/\s/g, "_"),
        })),
      };
      let saved;
      if (payload._id)
        saved = await DataStorage.updateReason(payload._id, payload);
      else saved = await DataStorage.createReason(payload);
      if (saved) {
        await loadData();
        setShowReasonModal(false);
        setReasonFormData({});
        showToast({ message: "Reason saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save reason.",
        type: "error",
      });
    }
  };

  // ── Standard Process Presets (quick-add) ────────────────────────────────
  const STANDARD_PROCESSES = [
    {
      processId: "DIE_CASTING",
      processName: "Die Casting",
      operation: "Die Casting Process",
      icon: "🏭",
      color: "#00877f",
      isMultiMachine: true,
    },
    {
      processId: "COATING",
      processName: "Coating",
      operation: "Coating Process",
      icon: "🎨",
      color: "#059669",
      isMultiMachine: false,
    },
    {
      processId: "MACHINING",
      processName: "Machining",
      operation: "Machining Process",
      icon: "⚙️",
      color: "#7c3aed",
      isMultiMachine: true,
    },
    {
      processId: "FINAL_QA",
      processName: "Final QA",
      operation: "Final QA Inspection",
      icon: "🔎",
      color: "#ea580c",
      isMultiMachine: false,
    },
  ];

  const handleSaveProcess = async () => {
    const items: any[] = processFormData.items || [];
    if (items.length === 0) {
      showToast({
        message: "Please add at least one process.",
        type: "warning",
      });
      return;
    }
    if (items.some((p: any) => !p.processName?.trim())) {
      showToast({
        message: "All processes must have a name.",
        type: "warning",
      });
      return;
    }

    try {
      // Delete processes removed from the list
      const keptIds = items.map((p: any) => p._id).filter(Boolean);
      for (const existing of processes) {
        if (!keptIds.includes(existing._id)) {
          await DataStorage.deleteProcess(existing._id);
        }
      }
      // Upsert all items with their order positions
      for (let i = 0; i < items.length; i++) {
        const p = items[i];
        const payload = {
          processName: p.processName.trim(),
          operation: p.operation?.trim() || "",
          isMultiMachine: !!p.isMultiMachine,
          order: i + 1,
          ...(!p._id && { processId: p.processId }),
        };
        if (p._id) {
          await DataStorage.updateProcess(p._id, payload);
        } else {
          await DataStorage.createProcess({
            ...payload,
            processId: p.processId,
          });
        }
      }
      await loadData();
      setShowProcessModal(false);
      setProcessFormData({});
      showToast({
        message: "Process workflow saved successfully.",
        type: "success",
      });
    } catch (e) {
      showToast({ message: "Failed to save processes.", type: "error" });
    }
  };

  const handleSaveProgram = async () => {
    if (!programFormData.programCode?.trim()) {
      showToast({ message: "Program Code is required.", type: "warning" });
      return;
    }
    if (!programFormData.programName?.trim()) {
      showToast({ message: "Program Name is required.", type: "warning" });
      return;
    }
    try {
      let saved;
      if (programFormData._id)
        saved = await DataStorage.updateProgramMaster(
          programFormData._id,
          programFormData,
        );
      else saved = await DataStorage.createProgramMaster(programFormData);
      if (saved) {
        await loadData();
        setShowProgramModal(false);
        setProgramFormData({});
        showToast({ message: "Program saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save program.",
        type: "error",
      });
    }
  };

  const handleSaveVendor = async () => {
    if (!vendorFormData.vendorName?.trim()) {
      showToast({ message: "Vendor Name is required.", type: "warning" });
      return;
    }
    try {
      let saved;
      if (vendorFormData._id)
        saved = await DataStorage.updateVendor(
          vendorFormData._id,
          vendorFormData,
        );
      else saved = await DataStorage.createVendor(vendorFormData);
      if (saved) {
        await loadData();
        setShowVendorModal(false);
        setVendorFormData({});
        showToast({ message: "Vendor saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save vendor.",
        type: "error",
      });
    }
  };

  const handleSaveOperator = async () => {
    if (
      !operatorFormData.operatorId ||
      !operatorFormData.name ||
      !operatorFormData.process
    ) {
      showToast({
        message: "Operator ID, Name and Process are required.",
        type: "warning",
      });
      return;
    }
    try {
      let saved;
      if (operatorFormData._id)
        saved = await DataStorage.updateOperator(
          operatorFormData._id,
          operatorFormData,
        );
      else saved = await DataStorage.createOperator(operatorFormData);
      if (saved) {
        await loadData();
        setShowOperatorModal(false);
        setOperatorFormData({});
        showToast({ message: "Operator saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save operator.",
        type: "error",
      });
    }
  };

  const handleSaveMaterial = async () => {
    if (
      !materialFormData.materialId ||
      !materialFormData.materialName ||
      !materialFormData.materialGrades?.[0]
    ) {
      showToast({
        message: "Material ID, Name and Grade are required.",
        type: "warning",
      });
      return;
    }
    // Uniqueness check for new materials
    if (
      !editId &&
      materials.some(
        (m) =>
          m.materialId?.trim().toUpperCase() ===
          materialFormData.materialId?.trim().toUpperCase(),
      )
    ) {
      showToast({
        message: `Material ID "${materialFormData.materialId}" already exists.`,
        type: "error",
      });
      return;
    }
    try {
      let saved;
      if (materialFormData._id)
        saved = await DataStorage.updateMaterial(
          materialFormData._id,
          materialFormData,
        );
      else saved = await DataStorage.createMaterial(materialFormData);
      if (saved) {
        await loadData();
        setShowMaterialModal(false);
        setMaterialFormData({});
        showToast({ message: "Material saved.", type: "success" });
      }
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to save material.",
        type: "error",
      });
    }
  };

  const handleSavePart = async () => {
    if (
      !partFormData.partId ||
      !partFormData.partName ||
      !partFormData.materialId
    ) {
      showToast({
        message: "Part ID, Name and Material are required.",
        type: "warning",
      });
      return;
    }
    // Uniqueness check for new parts
    if (
      !editId &&
      parts.some(
        (p) =>
          p.partId?.trim().toUpperCase() ===
          partFormData.partId?.trim().toUpperCase(),
      )
    ) {
      showToast({
        message: `Part ID "${partFormData.partId}" already exists.`,
        type: "error",
      });
      return;
    }
    const weight = parseFloat(String(partFormData.weightPerPartKg ?? 0));
    // Round buffer to 2 decimal places
    const buffer =
      Math.round(parseFloat(String(partFormData.bufferPercent ?? 0)) * 100) /
      100;

    if (weight <= 0) {
      showToast({
        message: "Weight Per Part (KG) must be greater than zero.",
        type: "warning",
      });
      return;
    }

    if (buffer < 0 || buffer > 100) {
      showToast({
        message: "Buffer % must be between 0 and 100.",
        type: "warning",
      });
      return;
    }

    const data = {
      partId: partFormData.partId?.trim(),
      partName: partFormData.partName?.trim(),
      materialId: partFormData.materialId,
      weightPerPartKg: weight,
      bufferPercent: buffer,
      tenantId: currentUser?.tenantId,
    };

    let saved;
    try {
      if (editId) {
        saved = await DataStorage.updatePart(editId, data);
      } else {
        saved = await DataStorage.createPart(data);
      }

      if (saved) {
        await loadData();
        setShowPartModal(false);
        setPartFormData({});
        setEditId(null);
        showToast({ message: "Part saved successfully.", type: "success" });
      } else {
        showToast({
          message: "Failed to save part. Server returned an error.",
          type: "error",
        });
      }
    } catch (err: any) {
      console.error("Save Part Error:", err);
      showToast({
        message: err.message || "Network error while saving part.",
        type: "error",
      });
    }
  };

  const handleDelete = (user: User) => {
    showConfirm({
      title: "Delete User",
      message: `Are you sure you want to delete user "${user.name}" with role "${user.role}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const success = await DataStorage.deleteUser(user.id);
          if (success) {
            showToast({
              message: "User deleted successfully.",
              type: "success",
            });
            await loadData();
          } else {
            showToast({
              message: "Delete failed. Check permissions.",
              type: "error",
            });
          }
        } catch (err) {
          showToast({
            message: "Network error while deleting user.",
            type: "error",
          });
        }
      },
    });
  };

  const handleDeleteRole = (id: string, name: string) => {
    showConfirm({
      title: "Delete Role",
      message: `Are you sure you want to delete role "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const success = await DataStorage.deleteRole(id);
        if (success) {
          showToast({ message: "Role deleted successfully.", type: "success" });
          await loadData();
        } else {
          showToast({ message: "Failed to delete role.", type: "error" });
        }
      },
    });
  };

  const handleDeleteMachine = (id: string, name: string) => {
    showConfirm({
      title: "Delete Machine",
      message: `Are you sure you want to delete machine "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const success = await DataStorage.deleteMachine(id);
        if (success) {
          showToast({
            message: "Machine deleted successfully.",
            type: "success",
          });
          await loadData();
        } else {
          showToast({ message: "Failed to delete machine.", type: "error" });
        }
      },
    });
  };

  const handleDeleteShift = (id: string, name: string) => {
    showConfirm({
      title: "Delete Shift",
      message: `Are you sure you want to delete shift "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const success = await DataStorage.deleteShift(id);
        if (success) {
          showToast({
            message: "Shift deleted successfully.",
            type: "success",
          });
          await loadData();
        } else {
          showToast({ message: "Failed to delete shift.", type: "error" });
        }
      },
    });
  };

  const handleDeleteDevice = (id: string, name: string) => {
    showConfirm({
      title: "Delete Device",
      message: `Are you sure you want to delete device "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteDevice(id);
        if (ok) {
          await loadData();
          showToast({ message: "Device deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete device.", type: "error" });
      },
    });
  };

  const handleDeleteGateway = (id: string, name: string) => {
    showConfirm({
      title: "Delete Gateway",
      message: `Are you sure you want to delete gateway "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteGatewayMaster(id);
        if (ok) {
          await loadData();
          showToast({ message: "Gateway deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete gateway.", type: "error" });
      },
    });
  };

  const handleDeleteOTA = (id: string, name: string) => {
    showConfirm({
      title: "Delete OTA",
      message: `Are you sure you want to delete OTA config "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteOTAConfig(id);
        if (ok) {
          await loadData();
          showToast({ message: "OTA deleted.", type: "success" });
        } else showToast({ message: "Failed to delete OTA.", type: "error" });
      },
    });
  };

  const handleDeleteDept = (id: string, name: string) => {
    showConfirm({
      title: "Delete Department",
      message: `Are you sure you want to delete department "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteDepartment(id);
        if (ok) {
          await loadData();
          showToast({ message: "Department deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete department.", type: "error" });
      },
    });
  };

  const handleDeleteMachineType = (id: string, name: string) => {
    showConfirm({
      title: "Delete Machine Type",
      message: `Are you sure you want to delete machine type "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteMachineType(id);
        if (ok) {
          await loadData();
          showToast({ message: "Machine type deleted.", type: "success" });
        } else
          showToast({
            message: "Failed to delete machine type.",
            type: "error",
          });
      },
    });
  };

  const handleDeleteReason = (id: string, name: string) => {
    showConfirm({
      title: "Delete Reason",
      message: `Are you sure you want to delete reason "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteReason(id);
        if (ok) {
          await loadData();
          showToast({ message: "Reason deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete reason.", type: "error" });
      },
    });
  };

  const handleDeleteProcess = (id: string, name: string) => {
    showConfirm({
      title: "Delete Process",
      message: `Are you sure you want to delete process "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteProcess(id);
        if (ok) {
          await loadData();
          showToast({ message: "Process deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete process.", type: "error" });
      },
    });
  };

  const handleDeleteProgram = (id: string, name: string) => {
    showConfirm({
      title: "Delete Program",
      message: `Are you sure you want to delete program "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteProgramMaster(id);
        if (ok) {
          await loadData();
          showToast({ message: "Program deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete program.", type: "error" });
      },
    });
  };

  const handleDeleteVendor = (id: string, name: string) => {
    showConfirm({
      title: "Delete Vendor",
      message: `Are you sure you want to delete vendor "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteVendor(id);
        if (ok) {
          await loadData();
          showToast({ message: "Vendor deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete vendor.", type: "error" });
      },
    });
  };

  const handleDeleteOperator = (id: string, name: string) => {
    showConfirm({
      title: "Delete Operator",
      message: `Are you sure you want to delete operator "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteOperator(id);
        if (ok) {
          await loadData();
          showToast({ message: "Operator deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete operator.", type: "error" });
      },
    });
  };

  const handleDeleteMaterial = (id: string, name: string) => {
    showConfirm({
      title: "Delete Material",
      message: `Are you sure you want to delete material "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deleteMaterial(id);
        if (ok) {
          await loadData();
          showToast({ message: "Material deleted.", type: "success" });
        } else
          showToast({ message: "Failed to delete material.", type: "error" });
      },
    });
  };

  const handleDeletePart = (id: string, name: string) => {
    showConfirm({
      title: "Delete Part",
      message: `Are you sure you want to delete part "${name}"?`,
      isDestructive: true,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const ok = await DataStorage.deletePart(id);
        if (ok) {
          await loadData();
          showToast({ message: "Part deleted.", type: "success" });
        } else showToast({ message: "Failed to delete part.", type: "error" });
      },
    });
  };

  const handleDownloadConfig = (device: any) => {
    // Derive domain from API_BASE_URL — strip trailing /api path if present
    const domainBase = API_BASE_URL.replace(/\/$/, "");
    // const domainBase = API_BASE_URL.replace(/\/testapi\/?$/, '').replace(/\/$/, '');
    const config = {
      custId: device.custId || currentUser?.tenantId || "",
      plantId: device.plantId || "",
      gatewayId: device.gatewayId,
      parentKey: device.parentKey || "",
      domine: domainBase,
    };
    const jsonStr = JSON.stringify(config);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

    if (Platform.OS === "web") {
      const blob = new Blob([encoded], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `device_config_${device.gatewayId.replace(/\s+/g, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast({ message: "Config downloaded.", type: "success" });
    } else {
      Alert.alert("Device Config", encoded);
    }
  };

  const publishDeviceCommand = async (device: any, cmd: string) => {
    try {
      await DataStorage.publishDeviceCommand(device._id, cmd);
      showToast({
        message: `Published ${cmd} to ${device.gatewayName || device.gatewayId}.`,
        type: "success",
      });
    } catch (e: any) {
      showToast({
        message: e.message || "Failed to publish command.",
        type: "error",
      });
    }
  };

  const handlePublishDeviceCommand = (device: any) => {
    if (Platform.OS === "web") {
      const menu = GATEWAY_COMMANDS.map(
        (c, idx) => `${idx + 1}. ${c.value} - ${c.label}`,
      ).join("\n");
      const answer = window.prompt(`Choose command to publish:\n\n${menu}`);
      if (!answer) return;
      const selected =
        GATEWAY_COMMANDS[Number(answer) - 1] ||
        GATEWAY_COMMANDS.find((c) => c.value === answer.trim().toUpperCase());
      if (!selected) {
        showToast({ message: "Invalid command selection.", type: "warning" });
        return;
      }
      publishDeviceCommand(device, selected.value);
      return;
    }

    Alert.alert(
      "Publish Gateway Command",
      `Choose command for ${device.gatewayName || device.gatewayId}`,
      [
        ...GATEWAY_COMMANDS.map((command) => ({
          text: command.value,
          onPress: () => publishDeviceCommand(device, command.value),
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const handleResetData = () => {
    showConfirm({
      title: "FACTORY RESET",
      message:
        "Are you sure you want to delete ALL data? This will wipe the database and reload the initial demo data.",
      isDestructive: true,
      confirmLabel: "Wipe Data",
      onConfirm: async () => {
        await DataStorage.resetAllData();
        await DataStorage.initializeSampleData();
        await loadData();
        showToast({ message: "System data has been reset.", type: "success" });
      },
    });
  };

  const roleColumns: Column<Role>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      searchable: false,
      render: (r) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {r.name?.toLowerCase().includes("tenant_admin") ||
          r.label?.toLowerCase().includes("legacy") ? (
            <View
              style={[
                styles.actionBtnEdit,
                { backgroundColor: "#edf5f4", borderColor: "#d7e6e4" },
              ]}
            >
              <Text style={[styles.actionBtnEditText, { color: "#7a9692" }]}>
                Protected
              </Text>
            </View>
          ) : (
            <>
              {can(currentUser, "configuration", "edit") && (
                <TouchableOpacity
                  style={styles.actionBtnEdit}
                  onPress={() => {
                    setRoleFormData({ ...r });
                    setEditId(r._id!);
                    setShowRoleModal(true);
                  }}
                >
                  <Text style={styles.actionBtnEditText}>Edit</Text>
                </TouchableOpacity>
              )}
              {can(currentUser, "configuration", "delete") && (
                <TouchableOpacity
                  style={styles.actionBtnDelete}
                  onPress={() => handleDeleteRole(r._id!, r.label)}
                >
                  <Text style={styles.actionBtnDeleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ),
    },
    { key: "label", header: "Display Name", minWidth: 150 },
    { key: "name", header: "Role ID (Internal)", minWidth: 150 },
    { key: "description", header: "Description", minWidth: 200 },
  ];

  const columns: Column<User>[] = [
    {
      key: "id",
      header: "Actions",
      width: 160,
      searchable: false,
      render: (u) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {u.role === "tenant_admin" ? (
            <View
              style={[
                styles.actionBtnEdit,
                { backgroundColor: "#edf5f4", borderColor: "#d7e6e4" },
              ]}
            >
              <Text style={[styles.actionBtnEditText, { color: "#7a9692" }]}>
                Protected
              </Text>
            </View>
          ) : (
            <>
              {can(currentUser, "configuration", "edit") && (
                <TouchableOpacity
                  style={styles.actionBtnEdit}
                  onPress={() => openEdit(u)}
                >
                  <Text style={styles.actionBtnEditText}>Edit</Text>
                </TouchableOpacity>
              )}
              {can(currentUser, "configuration", "delete") && (
                <TouchableOpacity
                  style={styles.actionBtnDelete}
                  onPress={() => handleDelete(u)}
                >
                  <Text style={styles.actionBtnDeleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      ),
    },
    {
      key: "name",
      header: "Full Name",
      minWidth: 150,
      render: (u) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#083d3a" }}>
            {u.name}
          </Text>
        </View>
      ),
    },
    {
      key: "role",
      header: "Role",
      width: 140,
      render: (u) => (
        <View
          style={[
            styles.roleBadge,
            {
              backgroundColor:
                (DEFAULT_ROLE_COLORS[u.role] || "#5b7773") + "22",
            },
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              { color: DEFAULT_ROLE_COLORS[u.role] || "#5b7773" },
            ]}
          >
            {roles.find((r) => r.name === u.role)?.label ||
              u.role.toUpperCase()}
          </Text>
        </View>
      ),
    },
    {
      key: "email",
      header: "Email / ID",
      minWidth: 180,
      searchable: true,
      render: (u) => (
        <Text style={{ fontSize: 13, color: "#486966" }}>{u.email}</Text>
      ),
    },
    {
      key: "process",
      header: "Assigned Process",
      width: 160,
      render: (u) => {
        if (!u.process)
          return <Text style={{ fontSize: 12, color: "#7a9692" }}>—</Text>;
        if (u.process === "ALL")
          return (
            <View
              style={{
                backgroundColor: "#f0fdf4",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: "700", color: "#166534" }}
              >
                All Processes
              </Text>
            </View>
          );
        const matched = processes.find((p) => p.processId === u.process);
        return (
          <View
            style={{
              backgroundColor: "#e8f8f6",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#00877f" }}>
              {matched?.processName || u.process}
            </Text>
          </View>
        );
      },
    },
  ];

  const machineColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (m) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setMachineFormData(m);
                setShowMachineModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteMachine(m._id, m.name)}
            >
              <Text style={styles.actionBtnDeleteText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "machineId", header: "Machine ID", width: 120 },
    { key: "name", header: "Name", minWidth: 150 },
    { key: "type", header: "Type", width: 150 },
    {
      key: "status",
      header: "Status",
      width: 100,
      render: (m) => <StatusBadge status={m.status} />,
    },
  ];

  const shiftColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (s) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setShiftFormData(s);
                setShowShiftModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteShift(s._id, s.name)}
            >
              <Text style={styles.actionBtnDeleteText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "shiftId", header: "Shift ID", width: 100 },
    { key: "name", header: "Shift Name", minWidth: 150 },
    { key: "startTime", header: "Start Time", width: 100 },
    { key: "endTime", header: "End Time", width: 100 },
    {
      key: "breaks",
      header: "Breaks",
      width: 80,
      render: (s) => s.breaks?.length || 0,
    },
  ];

  const deviceColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 360,
      render: (d) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.actionBtnEdit}
            onPress={() => {
              setIsViewOnly(true);
              setDeviceFormData(normalizeDevicePerformanceAlgorithm(d));
              setShowDeviceModal(true);
            }}
          >
            <Text style={styles.actionBtnEditText}>View</Text>
          </TouchableOpacity>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setIsViewOnly(false);
                setDeviceFormData(normalizeDevicePerformanceAlgorithm(d));
                setShowDeviceModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionBtnConfig}
            onPress={() => handleDownloadConfig(d)}
          >
            <Text style={styles.actionBtnConfigText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnPublish}
            onPress={() => handlePublishDeviceCommand(d)}
          >
            <Text style={styles.actionBtnPublishText}>Publish</Text>
          </TouchableOpacity>
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteDevice(d._id, d.gatewayName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "gatewayId", header: "Gateway ID", width: 150 },
    { key: "gatewayName", header: "Name", minWidth: 150 },
    { key: "licensing", header: "Licensing", width: 120 },
    { key: "machineType", header: "Machine Type", width: 140 },
  ];

  const gatewayColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (g) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setGatewayFormData(g);
                setShowGatewayModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteGateway(g._id, g.name)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "gatewayId", header: "Gateway ID", width: 150 },
    { key: "name", header: "Name", minWidth: 150 },
  ];

  const otaColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (o) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.actionBtnEdit, { backgroundColor: "#00877f" }]}
            onPress={() => DataStorage.downloadOTAFile(o._id)}
          >
            <Text style={[styles.actionBtnEditText, { color: "#fff" }]}>
              ⬇ Download
            </Text>
          </TouchableOpacity>
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteOTA(o._id, o.fileName)}
            >
              <Text style={styles.actionBtnDeleteText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "fileName", header: "File Name", minWidth: 200 },
    { key: "version", header: "Version", width: 100 },
    {
      key: "fileSize",
      header: "Size",
      width: 100,
      render: (o) => {
        const bytes = o.fileSize || 0;
        const kb = bytes / 1024;
        const label =
          kb >= 1024
            ? `${(kb / 1024).toFixed(1)} MB`
            : kb > 0
              ? `${kb.toFixed(1)} KB`
              : "—";
        return <Text style={{ fontSize: 13, color: "#486966" }}>{label}</Text>;
      },
    },
    {
      key: "updatedAt",
      header: "Uploaded",
      width: 150,
      render: (o) => (
        <Text style={{ fontSize: 13, color: "#486966" }}>
          {fmtDate(o.updatedAt)}
        </Text>
      ),
    },
  ];

  const deptColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (d) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setDeptFormData(d);
                setShowDeptModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteDept(d._id, d.departmentName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "departmentId", header: "Dept ID", width: 120 },
    { key: "departmentName", header: "Name", minWidth: 150 },
  ];

  const machineTypeColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (m) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setMtFormData(m);
                setShowMachineTypeModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteMachineType(m._id, m.machineType)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    {
      key: "processCategory",
      header: "Process Category",
      width: 150,
      render: (m) => {
        const map: Record<string, string> = {
          DIE_CASTING: "🏭 Die Casting",
          COATING: "🎨 Coating",
          MACHINING: "⚙️ Machining",
          FINAL_QA: "🔎 Final QA",
        };
        return (
          <Text style={{ fontSize: 12, color: "#00877f", fontWeight: "600" }}>
            {map[m.processCategory] || m.processCategory || "—"}
          </Text>
        );
      },
    },
    { key: "machineType", header: "Machine Type / Model", minWidth: 150 },
    {
      key: "description",
      header: "Description",
      minWidth: 150,
      render: (m) => (
        <Text style={{ fontSize: 12, color: "#5b7773" }}>
          {m.description || "—"}
        </Text>
      ),
    },
  ];

  const operatorColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (o) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setOperatorFormData(o);
                setShowOperatorModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteOperator(o._id, o.name)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "operatorId", header: "Emp ID", width: 120 },
    { key: "name", header: "Name", minWidth: 200 },
    {
      key: "process",
      header: "Process",
      width: 180,
      render: (o) => {
        const map: Record<string, string> = {
          DIE_CASTING: "🏭 Die Casting",
          COATING: "🎨 Coating",
          MACHINING: "⚙️ Machining",
          ALL: "🌍 All Processes",
        };
        return (
          <Text style={{ fontSize: 12, color: "#00877f", fontWeight: "600" }}>
            {map[o.process] || o.process || "—"}
          </Text>
        );
      },
    },
  ];

  const reasonColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (r) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                const subs = (r.subReasons || r.subReason || []).map(
                  (sr: any) => ({
                    label: sr.subReason || sr.label || "",
                    value:
                      sr.subReasonCode ||
                      sr.value ||
                      (sr.subReason || sr.label || "")
                        .toUpperCase()
                        .replace(/\s/g, "_"),
                  }),
                );
                setReasonFormData({ ...r, subReason: subs });
                setShowReasonModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteReason(r._id, r.reason)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: 150,
      render: (r) => {
        const cat = r.category || r.reasonType || r.reason_type || "";
        const map: Record<string, string> = {
          REJECTION: "❌ Rejection",
          REWORK: "🔄 Rework",
          SCRAP: "🗑️ Scrap",
        };
        const color =
          cat === "REJECTION"
            ? "#dc2626"
            : cat === "REWORK"
              ? "#7c3aed"
              : "#486966";
        return (
          <Text style={{ fontSize: 12, fontWeight: "700", color }}>
            {map[cat] || cat || "—"}
          </Text>
        );
      },
    },
    {
      key: "type",
      header: "Applicable Process",
      width: 150,
      render: (r) => {
        const proc =
          r.type || r.processType || r.processCategory || r.stageType || "";
        const map: Record<string, string> = {
          DIE_CASTING: "🏭 Die Casting",
          COATING: "🎨 Coating",
          MACHINING: "⚙️ Machining",
          FINAL_QA: "🔎 Final QA",
        };
        return (
          <Text style={{ fontSize: 12, color: "#00877f" }}>
            {map[proc] || proc || "—"}
          </Text>
        );
      },
    },
    { key: "reasonCode", header: "Code", width: 100 },
    { key: "reason", header: "Reason description", minWidth: 200 },
  ];

  const processColumns: Column<any>[] = [
    {
      key: "order",
      header: "Order",
      width: 70,
      render: (p) => <Text style={{ fontWeight: "700" }}>#{p.order || 0}</Text>,
    },
    { key: "processId", header: "Process ID", width: 130 },
    { key: "processName", header: "Name", width: 150 },
    {
      key: "operation",
      header: "Operation",
      minWidth: 160,
      render: (p) => (
        <Text style={{ color: "#486966" }}>{p.operation || "—"}</Text>
      ),
    },
    {
      key: "isMultiMachine",
      header: "Multi-Machine",
      width: 120,
      render: (p) => (
        <View
          style={{
            backgroundColor: p.isMultiMachine ? "#dcfce7" : "#edf5f4",
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            alignSelf: "flex-start",
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: p.isMultiMachine ? "#166534" : "#5b7773",
            }}
          >
            {p.isMultiMachine ? "Yes" : "No"}
          </Text>
        </View>
      ),
    },
  ];

  const programColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (p) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setProgramFormData(p);
                setShowProgramModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteProgram(p._id, p.programName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "programId", header: "Prg ID", width: 120 },
    { key: "programName", header: "Name", minWidth: 150 },
    {
      key: "processCategory",
      header: "Process",
      width: 150,
      render: (p) => {
        const map: Record<string, string> = {
          DIE_CASTING: "🏭 Die Casting",
          MACHINING: "⚙️ Machining",
          COATING: "🎨 Coating",
        };
        return (
          <Text style={{ fontSize: 12, color: "#00877f", fontWeight: "600" }}>
            {map[p.processCategory] || p.processCategory || "—"}
          </Text>
        );
      },
    },
    { key: "programCode", header: "Code", width: 120 },
  ];

  const vendorColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (v) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setVendorFormData(v);
                setShowVendorModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteVendor(v._id, v.vendorName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "vendorId", header: "Vendor ID", width: 120 },
    { key: "vendorName", header: "Name", minWidth: 150 },
    { key: "city", header: "City", width: 120 },
    { key: "area", header: "Area", width: 120 },
  ];

  const materialColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (m) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setMaterialFormData(m);
                setShowMaterialModal(true);
                setEditId(m._id);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeleteMaterial(m._id, m.materialName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "materialId", header: "Mat ID", width: 120 },
    { key: "materialName", header: "Material Name", minWidth: 200 },
    {
      key: "materialGrades",
      header: "Grades",
      width: 150,
      render: (m) => (
        <Text style={{ fontSize: 13 }}>
          {(m.materialGrades || []).join(", ")}
        </Text>
      ),
    },
  ];

  const partColumns: Column<any>[] = [
    {
      key: "_id",
      header: "Actions",
      width: 160,
      render: (p) => (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {can(currentUser, "configuration", "edit") && (
            <TouchableOpacity
              style={styles.actionBtnEdit}
              onPress={() => {
                setEditId(p._id);
                setPartFormData(p);
                setShowPartModal(true);
              }}
            >
              <Text style={styles.actionBtnEditText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can(currentUser, "configuration", "delete") && (
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDeletePart(p._id, p.partName)}
            >
              <Text style={styles.actionBtnDeleteText}>Del</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    },
    { key: "partId", header: "Part ID", width: 120 },
    { key: "partName", header: "Part Name", minWidth: 200 },
    { key: "materialId", header: "Material ID", width: 150 },
    {
      key: "weightPerPartKg",
      header: "Weight (KG)",
      width: 120,
      render: (p) => (
        <Text style={{ fontSize: 13, color: "#315451" }}>
          {Number(p.weightPerPartKg || 0).toFixed(3)}
        </Text>
      ),
    },
    {
      key: "bufferPercent",
      header: "Buffer %",
      width: 100,
      render: (p) => (
        <Text style={{ fontSize: 13, color: "#00877f", fontWeight: "700" }}>
          {p.bufferPercent || 0}%
        </Text>
      ),
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, width: "100%" }}
    >
      <View style={styles.maxWidth}>
        <PageHeader
          title="System Configuration"
          subtitle="Manage users, role types, and system access"
          actionLabel={
            can(currentUser, "configuration", "add") &&
            activeTab !== "acceptance" &&
            (activeTab !== "shifts" || canAddAnotherShift)
              ? `Add New ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace(/([A-Z])/g, " $1")}`
              : undefined
          }
          onAction={async () => {
            if (activeTab === "users") openAdd();
            else if (activeTab === "roles") {
              setRoleFormData({});
              setEditId(null);
              setShowRoleModal(true);
            } else if (activeTab === "machines") {
              setMachineFormData({ status: "ACTIVE" });
              setShowMachineModal(true);
            } else if (activeTab === "shifts") {
              if (!canAddAnotherShift) {
                showToast({
                  message: "Shift timings already cover 24 hours.",
                  type: "warning",
                });
                return;
              }
              setShiftFormData({
                shiftId: `SH${String(shifts.length + 1).padStart(3, "0")}`,
                breaks: [],
              });
              setShowShiftModal(true);
            } else if (activeTab === "devices") {
              setIsViewOnly(false);
              setDeviceFormData({
                custId: currentUser?.tenantId || "CUST001",
                plantId: getNextPlantId(devices),
                parentKey:
                  (currentUser as any)?.parentKey ||
                  "d62bf63dcd169919f05f16a619f3818f",
                deviceId: "",
                deviceName: "",
                gatewayId: "",
                gatewayName: "",
                licensing: "",
                machineType: "",
                gatewayType: "10",
                partCountType: "0",
                avbFactor: {
                  enabled: 0,
                  postTime: 10,
                  algorithm: 1,
                  dutyCyc: 60,
                  runDur: 60,
                  interlock: 1,
                  dep: [],
                },
                performanceFactor: {
                  enabled: 0,
                  postTime: 30,
                  algorithm: [0],
                  debounceTime: 0,
                  dep: [],
                },
                INPin: { enabled: 1, scanTime: 10, postTime: 10 },
                eMICConfig: {
                  enabled: 1,
                  postTime: 10,
                  freq: 0,
                  phaseSeq: 1,
                  cngfFactor: [],
                },
              });
              setShowDeviceModal(true);
            } else if (activeTab === "ota") {
              setOtaFormData({});
              setShowOTAModal(true);
            } else if (activeTab === "departments") {
              setDeptFormData({});
              setShowDeptModal(true);
            } else if (activeTab === "machineTypes") {
              setMtFormData({});
              setShowMachineTypeModal(true);
            } else if (activeTab === "reasons") {
              setReasonFormData({});
              setShowReasonModal(true);
            } else if (activeTab === "processes") {
              const sorted = [...processes].sort(
                (a, b) => (a.order || 0) - (b.order || 0),
              );
              setProcessFormData({
                items: sorted,
                newProcess: {
                  processName: "",
                  operation: "",
                  isMultiMachine: false,
                },
              });
              setShowProcessModal(true);
            } else if (activeTab === "programMaster") {
              const nextId = `PRG${String(programMasters.length + 1).padStart(3, "0")}`;
              setProgramFormData({
                programId: nextId,
                processCategory: "DIE_CASTING",
              });
              setShowProgramModal(true);
            } else if (activeTab === "vendors") {
              const nextId = `VND${String(vendors.length + 1).padStart(3, "0")}`;
              setVendorFormData({ vendorId: nextId });
              setShowVendorModal(true);
            } else if (activeTab === "operators") {
              // Fetch latest to get accurate count for ID
              const allOps = await DataStorage.getAllOperators();
              setOperators(allOps || []);
              const nextId = `EMP${String((allOps || []).length + 1).padStart(3, "0")}`;
              setOperatorFormData({ operatorId: nextId, process: "ALL" });
              setShowOperatorModal(true);
            } else if (activeTab === "materials") {
              setMaterialFormData({ materialGrades: [] });
              setEditId(null);
              setShowMaterialModal(true);
            } else if (activeTab === "parts") {
              setPartFormData({});
              setEditId(null);
              setShowPartModal(true);
            }
          }}
        />

        {/* Tabs */}
        <View style={{ marginBottom: 16 }}>
          <View style={[styles.tabs, { flexWrap: "wrap", gap: 2 }]}>
            {CONFIG_TABS.map((tab) => {
              // Show tab if user has granular permission OR generic 'full' permission
              if (!can(currentUser, "configuration", tab.permission))
                return null;

              let count = 0;
              if (tab.id === "users") count = users.length;
              if (tab.id === "roles") count = roles.length;
              if (tab.id === "devices") count = devices.length;
              if (tab.id === "shifts") count = shifts.length;

              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    activeTab === tab.id && styles.tabActive,
                    { marginBottom: 4 }, // Add spacing between rows
                  ]}
                  onPress={() => {
                    setActiveTab(tab.id as any);
                    loadData(); // Refresh data on tab switch
                  }}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === tab.id && styles.tabTextActive,
                    ]}
                  >
                    {tab.label}
                    {count > 0 ? ` (${count})` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {activeTab === "users" && (
          <DataTable
            data={users}
            columns={columns}
            keyExtractor={(u) => u.id}
            emptyMessage="No users configured."
          />
        )}
        {activeTab === "roles" && (
          <DataTable
            data={roles}
            columns={roleColumns}
            keyExtractor={(r) => r.name}
            emptyMessage="No dynamic roles configured."
          />
        )}
        {activeTab === "machines" && (
          <DataTable
            data={machines}
            columns={machineColumns}
            keyExtractor={(m) => m._id}
            emptyMessage="No machines configured."
          />
        )}
        {activeTab === "shifts" && (
          <DataTable
            data={shifts}
            columns={shiftColumns}
            keyExtractor={(s) => s._id}
            emptyMessage="No shifts configured."
          />
        )}
        {activeTab === "acceptance" && (
          <View style={{ padding: 4 }}>
            {/* Add new point input */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <TextInput
                style={[inputStyle.input, { flex: 1 }]}
                placeholder="New acceptance point (e.g. Visual Inspection)"
                value={newPointText}
                onChangeText={setNewPointText}
              />
              <TouchableOpacity
                style={{
                  backgroundColor: "#00877f",
                  borderRadius: 8,
                  paddingHorizontal: 16,
                  justifyContent: "center",
                }}
                onPress={async () => {
                  const t = newPointText.trim();
                  if (!t) return;
                  const saved = await DataStorage.createAcceptancePoint({
                    point: t,
                  });
                  if (saved) {
                    setNewPointText("");
                    await loadData();
                  } else
                    Alert.alert("Error", "Failed to save acceptance point.");
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                >
                  + Add
                </Text>
              </TouchableOpacity>
            </View>
            {/* Existing points */}
            <Text style={{ fontSize: 11, color: "#7a9692", marginBottom: 4 }}>
              Total Points Found: {acceptancePoints.length} | Your Tenant:{" "}
              {currentUser?.tenantId || "NONE"}
            </Text>
            {acceptancePoints.length === 0 ? (
              <Text style={{ color: "#7a9692", fontSize: 14 }}>
                No acceptance points yet. Add one above.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {acceptancePoints.map((ap) => (
                  <View
                    key={ap._id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: "#dcfce7",
                      borderRadius: 20,
                      paddingVertical: 6,
                      paddingLeft: 14,
                      paddingRight: 8,
                      borderWidth: 1,
                      borderColor: "#4ade80",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#166534",
                      }}
                    >
                      {ap.point}
                    </Text>
                    <TouchableOpacity
                      onPress={async () => {
                        const ok = await DataStorage.deleteAcceptancePoint(
                          ap._id!,
                        );
                        if (ok) await loadData();
                        else Alert.alert("Error", "Failed to delete.");
                      }}
                      style={{
                        backgroundColor: "#fee2e2",
                        borderRadius: 12,
                        padding: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: "#dc2626",
                          fontWeight: "bold",
                        }}
                      >
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === "devices" && (
          <DataTable
            data={devices}
            columns={deviceColumns}
            keyExtractor={(d) => d._id}
            emptyMessage="No devices configured."
          />
        )}
        {/* {activeTab === 'gateways' && (
          <DataTable data={gateways} columns={gatewayColumns} keyExtractor={(g) => g._id} emptyMessage="No gateways configured." />
        )} */}
        {activeTab === "ota" && (
          <DataTable
            data={otaConfigs}
            columns={otaColumns}
            keyExtractor={(o) => o._id}
            emptyMessage="No OTA configurations."
          />
        )}
        {activeTab === "departments" && (
          <DataTable
            data={departments}
            columns={deptColumns}
            keyExtractor={(d) => d._id}
            emptyMessage="No departments configured."
          />
        )}
        {activeTab === "machineTypes" && (
          <DataTable
            data={machineTypes}
            columns={machineTypeColumns}
            keyExtractor={(m) => m._id}
            emptyMessage="No machine types configured."
          />
        )}
        {activeTab === "reasons" && (
          <DataTable
            data={reasons}
            columns={reasonColumns}
            keyExtractor={(r) => r._id}
            emptyMessage="No reasons configured."
          />
        )}
        {activeTab === "processes" && (
          <View>
            <DataTable
              data={processes.sort((a, b) => (a.order || 0) - (b.order || 0))}
              columns={processColumns}
              keyExtractor={(p) => p._id}
              emptyMessage="No processes configured."
            />
            {can(currentUser, "configuration", "edit") && (
              <View style={styles.processEditBar}>
                <TouchableOpacity
                  style={styles.processEditBtn}
                  onPress={() => {
                    const sorted = [...processes].sort(
                      (a, b) => (a.order || 0) - (b.order || 0),
                    );
                    setProcessFormData({
                      items: sorted,
                      newProcess: {
                        processName: "",
                        operation: "",
                        isMultiMachine: false,
                      },
                    });
                    setShowProcessModal(true);
                  }}
                >
                  <Text style={styles.processEditBtnIcon}>✎</Text>
                  <Text style={styles.processEditBtnText}>
                    Edit Process Workflow
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        {activeTab === "programMaster" && (
          <DataTable
            data={programMasters}
            columns={programColumns}
            keyExtractor={(p) => p._id}
            emptyMessage="No programs configured."
          />
        )}
        {activeTab === "vendors" && (
          <DataTable
            data={vendors}
            columns={vendorColumns}
            keyExtractor={(v) => v._id}
            emptyMessage="No vendors configured."
          />
        )}
        {activeTab === "operators" && (
          <DataTable
            data={operators}
            columns={operatorColumns}
            keyExtractor={(o) => o._id || o.operatorId}
            emptyMessage="No operators configured."
          />
        )}
        {activeTab === "materials" && (
          <DataTable
            data={materials}
            columns={materialColumns}
            keyExtractor={(m) => m._id}
            emptyMessage="No materials configured."
          />
        )}
        {activeTab === "parts" && (
          <DataTable
            data={parts}
            columns={partColumns}
            keyExtractor={(p) => p._id}
            emptyMessage="No parts configured."
          />
        )}

        {/* <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerText}>
            Wipe all application data (Users, Inventory, Work Orders, Inspections). Action cannot be undone.
          </Text>
          <TouchableOpacity style={styles.btnDanger} onPress={handleResetData}>
            <Text style={styles.btnDangerText}>⚠ Factory Reset Database</Text>
          </TouchableOpacity>
        </View> */}

        {/* Form Modal */}
        <FormModal
          visible={showModal}
          title={editId ? "Edit User" : "Add New User"}
          subtitle="Fill in the user details below"
          onClose={() => {
            setShowModal(false);
            setFormData({});
            setEditId(null);
            setShowUserPassword(false);
            setShowRolePicker(false);
          }}
          onSave={handleSave}
          saveLabel={editId ? "Update" : "Create User"}
        >
          <FormField label="Full Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Sharma"
              value={formData.name}
              onChangeText={(t) => setFormData({ ...formData, name: t })}
              maxLength={80}
            />
          </FormField>
          <FormField label="Email" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. test@gk.com"
              value={formData.email}
              onChangeText={(t) =>
                setFormData({ ...formData, email: t.trim().toLowerCase() })
              }
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </FormField>
          <FormField
            label={editId ? "Password" : "Password"}
            required={!editId}
          >
            <View style={styles.passwordField}>
              <TextInput
                style={[inputStyle.input, styles.passwordInput]}
                placeholder={
                  editId
                    ? "Leave blank to keep current password"
                    : "Minimum 8 characters"
                }
                value={formData.password}
                onChangeText={(t) => setFormData({ ...formData, password: t })}
                secureTextEntry={!showUserPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowUserPassword((visible) => !visible)}
                activeOpacity={0.8}
              >
                <Text style={styles.passwordToggleText}>
                  {showUserPassword ? "Hide" : "Show"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              {editId
                ? "Optional. Enter a new password only if you want to reset it."
                : "Required. Minimum 8 characters with letters and numbers."}
            </Text>
          </FormField>
          <FormField label="Role" required>
            <TouchableOpacity
              style={[
                inputStyle.input,
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                },
              ]}
              onPress={() => setShowRolePicker(!showRolePicker)}
            >
              <Text style={{ color: formData.role ? "#083d3a" : "#7a9692" }}>
                {roles.find((r) => r.name === formData.role)?.label ||
                  "Select a role"}
              </Text>
              <Text style={{ color: "#5b7773" }}>
                {showRolePicker ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>

            {showRolePicker && (
              <View style={styles.dropdownList}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {roles.length === 0 ? (
                    <Text style={styles.dropdownEmptyText}>
                      No roles configured.
                    </Text>
                  ) : (
                    roles.map((r) => (
                      <TouchableOpacity
                        key={r.name}
                        style={[
                          styles.dropdownItem,
                          formData.role === r.name && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setFormData({
                            ...formData,
                            role: r.name,
                            customPermissions: resolveRolePermissions(
                              r.permissions || {},
                              moduleDefs,
                            ),
                          });
                          setShowRolePicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            formData.role === r.name &&
                              styles.dropdownItemTextActive,
                          ]}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}
          </FormField>

          <FormField label="Assigned Process">
            <Select
              value={formData.process || ""}
              options={[
                { label: "All Processes", value: "ALL" },
                ...processes.map((p) => ({
                  label: p.processName,
                  value: p.processId,
                })),
              ]}
              onSelect={(v) =>
                setFormData({ ...formData, process: v || undefined })
              }
              placeholder="Select process (optional)"
            />
          </FormField>

          {formData.role && (
            <PermissionsGrid
              title="Permissions"
              subtitle={`Based on "${roles.find((r) => r.name === formData.role)?.label ?? formData.role}" role. Toggle to customise.`}
              permissions={formData.customPermissions || {}}
              moduleDefs={moduleDefs}
              onChange={(p) =>
                setFormData({ ...formData, customPermissions: p })
              }
            />
          )}
        </FormModal>

        {/* Role Type Modal */}
        <FormModal
          visible={showRoleModal}
          title={editId ? "Edit Role Type" : "Add New Role Type"}
          subtitle="Configure a new system role"
          onClose={() => {
            setShowRoleModal(false);
            setRoleFormData({});
            setEditId(null);
          }}
          onSave={handleSaveRole}
          saveLabel={editId ? "Update Role" : "Create Role"}
        >
          <FormField label="Internal Name (ID)" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. supervisor_shift_a"
              value={roleFormData.name}
              onChangeText={(t) =>
                setRoleFormData({
                  ...roleFormData,
                  name: t.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                })
              }
              autoCapitalize="none"
              autoCorrect={false}
              editable={!editId}
              maxLength={40}
            />
            <Text style={styles.helperText}>
              3-40 lowercase letters, numbers or underscores. Cannot be changed
              after creation.
            </Text>
          </FormField>
          <FormField label="Display Label" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Shift A Supervisor"
              value={roleFormData.label}
              onChangeText={(t) =>
                setRoleFormData({ ...roleFormData, label: t })
              }
              maxLength={80}
            />
          </FormField>
          <FormField label="Description">
            <TextInput
              style={inputStyle.input}
              placeholder="What does this role do?"
              value={roleFormData.description}
              onChangeText={(t) =>
                setRoleFormData({ ...roleFormData, description: t })
              }
              multiline
            />
          </FormField>

          <PermissionsGrid
            title="Role Permissions"
            subtitle="Select which modules and actions this role has access to."
            permissions={roleFormData.permissions || {}}
            moduleDefs={moduleDefs}
            onChange={(p) =>
              setRoleFormData({ ...roleFormData, permissions: p })
            }
          />
        </FormModal>

        {/* Machine Modal */}
        <FormModal
          visible={showMachineModal}
          title={machineFormData._id ? "Edit Machine" : "Add New Machine"}
          onClose={() => {
            setShowMachineModal(false);
            setMachineFormData({});
          }}
          onSave={handleSaveMachine}
        >
          <FormField label="Machine ID" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. DC-01"
              value={machineFormData.machineId}
              onChangeText={(t) =>
                setMachineFormData({ ...machineFormData, machineId: t })
              }
            />
          </FormField>
          <FormField label="Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Die Casting Machine 1"
              value={machineFormData.name}
              onChangeText={(t) =>
                setMachineFormData({ ...machineFormData, name: t })
              }
            />
          </FormField>
          <FormField label="Type" required>
            <Select
              placeholder="Select process category"
              value={machineFormData.type || ""}
              options={processes.map((p) => ({
                label: p.processName,
                value: p.processId,
              }))}
              onSelect={(t) =>
                setMachineFormData({ ...machineFormData, type: t })
              }
              inline
            />
          </FormField>
          <FormField label="Machine Model / Specific Type" required>
            <Select
              placeholder="Select specific model"
              value={machineFormData.machineType || ""}
              options={machineTypes
                .filter((mt) => mt.processCategory === machineFormData.type)
                .map((mt) => ({
                  label: mt.machineType,
                  value: mt.machineType,
                }))}
              onSelect={(t) =>
                setMachineFormData({ ...machineFormData, machineType: t })
              }
              inline
            />
          </FormField>
          <FormField label="Status">
            <Select
              placeholder="Select status"
              value={machineFormData.status || "ACTIVE"}
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Inactive", value: "INACTIVE" },
                { label: "Offline", value: "OFFLINE" },
              ]}
              onSelect={(s) =>
                setMachineFormData({ ...machineFormData, status: s })
              }
              inline
            />
          </FormField>
        </FormModal>

        {/* Shift Modal */}
        <FormModal
          visible={showShiftModal}
          title={shiftFormData._id ? "Edit Shift" : "Add New Shift"}
          onClose={() => {
            setShowShiftModal(false);
            setShiftFormData({});
          }}
          onSave={handleSaveShift}
        >
          <FormField label="Shift ID" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. S1"
              value={shiftFormData.shiftId}
              onChangeText={(t) =>
                setShiftFormData({ ...shiftFormData, shiftId: t })
              }
            />
          </FormField>
          <FormField label="Shift Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Day Shift"
              value={shiftFormData.name}
              onChangeText={(t) =>
                setShiftFormData({ ...shiftFormData, name: t })
              }
            />
          </FormField>
          <FormField label="Start Time (HH:mm)" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. 08:00"
              value={shiftFormData.startTime}
              onChangeText={(t) =>
                setShiftFormData({ ...shiftFormData, startTime: t })
              }
            />
          </FormField>
          <FormField label="End Time (HH:mm)" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. 20:00"
              value={shiftFormData.endTime}
              onChangeText={(t) =>
                setShiftFormData({ ...shiftFormData, endTime: t })
              }
            />
          </FormField>
          <FormField label="Description">
            <TextInput
              style={inputStyle.input}
              placeholder="Shift description"
              value={shiftFormData.description}
              onChangeText={(t) =>
                setShiftFormData({ ...shiftFormData, description: t })
              }
            />
          </FormField>
          <Text style={{ fontWeight: "bold", marginTop: 12, marginBottom: 8 }}>
            Breaks
          </Text>
          {(shiftFormData.breaks || []).map((b: any, idx: number) => (
            <View
              key={idx}
              style={{
                backgroundColor: "#f7fbfa",
                padding: 8,
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                <TextInput
                  style={[inputStyle.input, { flex: 2 }]}
                  placeholder="Break Name"
                  value={b.breakName}
                  onChangeText={(t) => {
                    const newB = (shiftFormData.breaks || []).map(
                      (bk: any, i: number) =>
                        i === idx ? { ...bk, breakName: t } : bk,
                    );
                    setShiftFormData({ ...shiftFormData, breaks: newB });
                  }}
                />
                <TextInput
                  style={[
                    inputStyle.input,
                    { flex: 1, backgroundColor: "#edf5f4", color: "#5b7773" },
                  ]}
                  placeholder="Dur (HH:mm)"
                  value={b.breakDuration}
                  editable={false}
                />
                <TouchableOpacity
                  onPress={() => {
                    const newB = (shiftFormData.breaks || []).filter(
                      (_: any, i: number) => i !== idx,
                    );
                    setShiftFormData({ ...shiftFormData, breaks: newB });
                  }}
                >
                  <Text style={{ color: "#ef4444", fontWeight: "bold" }}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[inputStyle.input, { flex: 1 }]}
                  placeholder="Start (HH:mm)"
                  value={b.breakStartTime}
                  onChangeText={(t) => {
                    const re = /^\d{1,2}:\d{2}$/;
                    const newB = (shiftFormData.breaks || []).map(
                      (bk: any, i: number) => {
                        if (i !== idx) return bk;
                        const updated = { ...bk, breakStartTime: t };
                        if (re.test(t) && re.test(bk.breakEndTime || "")) {
                          const toM = (x: string) => {
                            const [h, m] = x.split(":").map(Number);
                            return h * 60 + (m || 0);
                          };
                          const s = toM(t),
                            e = toM(bk.breakEndTime);
                          const dur = e > s ? e - s : e + 1440 - s;
                          updated.breakDuration = `${String(Math.floor(dur / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}`;
                        }
                        return updated;
                      },
                    );
                    setShiftFormData({ ...shiftFormData, breaks: newB });
                  }}
                />
                <TextInput
                  style={[inputStyle.input, { flex: 1 }]}
                  placeholder="End (HH:mm)"
                  value={b.breakEndTime}
                  onChangeText={(t) => {
                    const re = /^\d{1,2}:\d{2}$/;
                    const newB = (shiftFormData.breaks || []).map(
                      (bk: any, i: number) => {
                        if (i !== idx) return bk;
                        const updated = { ...bk, breakEndTime: t };
                        if (re.test(bk.breakStartTime || "") && re.test(t)) {
                          const toM = (x: string) => {
                            const [h, m] = x.split(":").map(Number);
                            return h * 60 + (m || 0);
                          };
                          const s = toM(bk.breakStartTime),
                            e = toM(t);
                          const dur = e > s ? e - s : e + 1440 - s;
                          updated.breakDuration = `${String(Math.floor(dur / 60)).padStart(2, "0")}:${String(dur % 60).padStart(2, "0")}`;
                        }
                        return updated;
                      },
                    );
                    setShiftFormData({ ...shiftFormData, breaks: newB });
                  }}
                />
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={{
              backgroundColor: "#edf5f4",
              padding: 8,
              borderRadius: 6,
              alignItems: "center",
            }}
            onPress={() => {
              setShiftFormData({
                ...shiftFormData,
                breaks: [
                  ...(shiftFormData.breaks || []),
                  {
                    breakName: "",
                    breakDuration: "",
                    breakStartTime: "",
                    breakEndTime: "",
                  },
                ],
              });
            }}
          >
            <Text style={{ color: "#00877f", fontWeight: "bold" }}>
              + Add Break
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              onPress={() =>
                setShiftFormData({
                  ...shiftFormData,
                  startNextDay: !shiftFormData.startNextDay,
                })
              }
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: "#00877f",
                  backgroundColor: shiftFormData.startNextDay
                    ? "#00877f"
                    : "transparent",
                }}
              />
              <Text style={{ fontSize: 13 }}>Starts Next Day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              onPress={() =>
                setShiftFormData({
                  ...shiftFormData,
                  endNextDay: !shiftFormData.endNextDay,
                })
              }
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: "#00877f",
                  backgroundColor: shiftFormData.endNextDay
                    ? "#00877f"
                    : "transparent",
                }}
              />
              <Text style={{ fontSize: 13 }}>Ends Next Day</Text>
            </TouchableOpacity>
          </View>
        </FormModal>

        {/* Device Modal Redesign */}
        <FormModal
          visible={showDeviceModal}
          title={
            isViewOnly
              ? "Device Details"
              : deviceFormData._id
                ? "Edit Device"
                : "New Device Configuration"
          }
          onClose={() => setShowDeviceModal(false)}
          onSave={handleSaveDevice}
          maxWidth={850}
          saveLabel={isViewOnly ? "Close" : "Save"}
        >
          {/* Device Identity */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#00877f22" }]}
              >
                <Text style={{ color: "#00877f", fontSize: 16 }}>🔗</Text>
              </View>
              <Text style={styles.configTitle}>Device Identity</Text>
            </View>
            <View style={styles.configRow}>
              <FormField label="Cust ID" style={{ flex: 1, minWidth: 200 }}>
                <TextInput
                  style={[inputStyle.input, { backgroundColor: "#edf5f4" }]}
                  value={deviceFormData.custId}
                  editable={false}
                />
              </FormField>
              <FormField label="Plant ID" style={{ flex: 1, minWidth: 200 }}>
                <TextInput
                  style={[inputStyle.input, { backgroundColor: "#edf5f4" }]}
                  value={deviceFormData.plantId}
                  editable={false}
                  onChangeText={(t) =>
                    setDeviceFormData({ ...deviceFormData, plantId: t })
                  }
                />
              </FormField>
            </View>
            <View style={styles.configRow}>
              <FormField
                label="Device ID"
                required
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  value={deviceFormData.deviceId}
                  maxLength={12}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      deviceId: t.toUpperCase(),
                    })
                  }
                  placeholder="12 Chars Alphanumeric"
                />
              </FormField>
              <FormField
                label="Device Name"
                required
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  value={deviceFormData.deviceName}
                  onChangeText={(t) =>
                    setDeviceFormData({ ...deviceFormData, deviceName: t })
                  }
                  placeholder="e.g. Device-1"
                />
              </FormField>
            </View>
            {/* <FormField label="Licensing">
              <Select
                options={LICENSING_OPTIONS}
                value={deviceFormData.licensing}
                onSelect={val => setDeviceFormData({ ...deviceFormData, licensing: val })}
              />
            </FormField> */}
            <FormField label="Machine Type">
              <Select
                placeholder="Select Machine Type"
                options={machineTypes.map((mt: any) => ({
                  label: mt.machineType,
                  value: mt.machineType,
                }))}
                value={deviceFormData.machineType || ""}
                onSelect={(val) =>
                  setDeviceFormData({ ...deviceFormData, machineType: val })
                }
              />
            </FormField>
          </View>
          {/* Gateway Identity */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#00877f22" }]}
              >
                <Text style={{ color: "#00877f", fontSize: 16 }}>🔗</Text>
              </View>
              <Text style={styles.configTitle}>Gateway Identity</Text>
            </View>

            <View style={styles.configRow}>
              <FormField
                label="Gateway ID"
                required
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  value={deviceFormData.gatewayId}
                  maxLength={12}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      gatewayId: t.toUpperCase(),
                    })
                  }
                  placeholder="12 Chars Alphanumeric"
                />
              </FormField>
              <FormField
                label="Gateway Name"
                required
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  value={deviceFormData.gatewayName}
                  onChangeText={(t) =>
                    setDeviceFormData({ ...deviceFormData, gatewayName: t })
                  }
                  placeholder="e.g. Gateway-1"
                />
              </FormField>
            </View>
            <FormField label="Licensing">
              <Select
                options={LICENSING_OPTIONS}
                value={deviceFormData.licensing}
                onSelect={(val) =>
                  setDeviceFormData({ ...deviceFormData, licensing: val })
                }
              />
            </FormField>
            {/* <FormField label="Machine Type">
              <Select
                placeholder="Select Machine Type"
                options={machineTypes.map((mt: any) => ({ label: mt.machineType, value: mt.machineType }))}
                value={deviceFormData.machineType || ''}
                onSelect={val => setDeviceFormData({ ...deviceFormData, machineType: val })}
              />
            </FormField> */}
            <FormField label="Gateway Type">
              <Select
                options={gatewayTypeOptions}
                value={deviceFormData.gatewayType}
                onSelect={(val) => {
                  const partCountType = getPartCountTypeValue();
                  const algorithm =
                    partCountType === 0
                      ? [
                          partCountType,
                          ...getSelectedDigitalPins(
                            getPerformanceAlgorithmValues(),
                            val,
                          ),
                        ]
                      : deviceFormData.performanceFactor?.algorithm;
                  setDeviceFormData({
                    ...deviceFormData,
                    gatewayType: val,
                    performanceFactor: {
                      ...deviceFormData.performanceFactor,
                      algorithm,
                    },
                  });
                }}
              />
            </FormField>
          </View>

          {/* Availability Factor */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#05966922" }]}
              >
                <Text style={{ color: "#059669", fontSize: 16 }}>📈</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.configTitle}>Availability Factor</Text>
                <Text style={styles.configSubtitle}>
                  Equipment availability algorithm configuration
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 12, color: "#5b7773" }}>
                  {deviceFormData.avbFactor?.enabled === 0
                    ? "Enabled"
                    : "Disabled"}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setDeviceFormData({
                      ...deviceFormData,
                      avbFactor: {
                        ...deviceFormData.avbFactor,
                        enabled:
                          deviceFormData.avbFactor?.enabled === 0 ? 1 : 0,
                      },
                    })
                  }
                  style={[
                    styles.toggleBase,
                    deviceFormData.avbFactor?.enabled === 0 &&
                      styles.toggleActive,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      deviceFormData.avbFactor?.enabled === 0 &&
                        styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.configRow}>
              <FormField
                label="Post Time (s)"
                style={{ flex: 1, minWidth: 140 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.avbFactor?.postTime || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      avbFactor: {
                        ...deviceFormData.avbFactor,
                        postTime: Number(t),
                      },
                    })
                  }
                />
              </FormField>
              <FormField
                label="Duty Cycle (%)"
                style={{ flex: 1, minWidth: 140 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.avbFactor?.dutyCyc || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      avbFactor: {
                        ...deviceFormData.avbFactor,
                        dutyCyc: Number(t),
                      },
                    })
                  }
                />
              </FormField>
              <FormField
                label="Run Duration (s)"
                style={{ flex: 1, minWidth: 140 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.avbFactor?.runDur || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      avbFactor: {
                        ...deviceFormData.avbFactor,
                        runDur: Number(t),
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Interlock" style={{ flex: 1, minWidth: 140 }}>
                <Select
                  options={[
                    { label: "Enable", value: 0 },
                    { label: "Disable", value: 1 },
                  ]}
                  value={deviceFormData.avbFactor?.interlock}
                  onSelect={(val) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      avbFactor: {
                        ...deviceFormData.avbFactor,
                        interlock: val,
                      },
                    })
                  }
                />
              </FormField>
            </View>
            <FormField label="Algorithm">
              <Select
                options={ALGORITHM_OPTIONS}
                value={deviceFormData.avbFactor?.algorithm}
                onSelect={(val) =>
                  setDeviceFormData({
                    ...deviceFormData,
                    avbFactor: { ...deviceFormData.avbFactor, algorithm: val },
                  })
                }
              />
            </FormField>
            <View style={styles.depSection}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#183f3c",
                    }}
                  >
                    LIST DEP VALUES
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {deviceFormData.avbFactor?.dep?.length || 0}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[inputStyle.input, { flex: 1, height: 40 }]}
                  placeholder="Enter value"
                  keyboardType="numeric"
                  id="avb_dep_input"
                  onSubmitEditing={(e) => {
                    const val = Number(e.nativeEvent.text);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.avbFactor?.dep?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        avbFactor: {
                          ...deviceFormData.avbFactor,
                          dep: [...(deviceFormData.avbFactor.dep || []), val],
                        },
                      });
                      (e.target as any).value = "";
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.addValBtn}
                  onPress={() => {
                    const input = document.getElementById(
                      "avb_dep_input",
                    ) as HTMLInputElement;
                    const val = Number(input?.value);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.avbFactor?.dep?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        avbFactor: {
                          ...deviceFormData.avbFactor,
                          dep: [...(deviceFormData.avbFactor.dep || []), val],
                        },
                      });
                      if (input) input.value = "";
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 18 }}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {deviceFormData.avbFactor?.dep?.map(
                  (val: number, idx: number) => (
                    <View key={idx} style={styles.valueChip}>
                      <Text style={styles.valueChipText}>{val}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          setDeviceFormData({
                            ...deviceFormData,
                            avbFactor: {
                              ...deviceFormData.avbFactor,
                              dep: deviceFormData.avbFactor.dep.filter(
                                (_: any, i: number) => i !== idx,
                              ),
                            },
                          })
                        }
                      >
                        <Text style={styles.valueChipClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
              </View>
            </View>
          </View>

          {/* Performance Factor */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#ea580c22" }]}
              >
                <Text style={{ color: "#ea580c", fontSize: 16 }}>⚡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.configTitle}>Performance Factor</Text>
                <Text style={styles.configSubtitle}>
                  Equipment performance algorithm configuration
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 12, color: "#5b7773" }}>
                  {deviceFormData.performanceFactor?.enabled === 0
                    ? "Enabled"
                    : "Disabled"}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setDeviceFormData({
                      ...deviceFormData,
                      performanceFactor: {
                        ...deviceFormData.performanceFactor,
                        enabled:
                          deviceFormData.performanceFactor?.enabled === 0
                            ? 1
                            : 0,
                      },
                    })
                  }
                  style={[
                    styles.toggleBase,
                    deviceFormData.performanceFactor?.enabled === 0 &&
                      styles.toggleActive,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      deviceFormData.performanceFactor?.enabled === 0 &&
                        styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.configRow}>
              <FormField
                label="Post Time (s)"
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(
                    deviceFormData.performanceFactor?.postTime || 0,
                  )}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      performanceFactor: {
                        ...deviceFormData.performanceFactor,
                        postTime: Number(t),
                      },
                    })
                  }
                />
              </FormField>
              <FormField
                label="Debounce Time (ms)"
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(
                    deviceFormData.performanceFactor?.debounceTime || 0,
                  )}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      performanceFactor: {
                        ...deviceFormData.performanceFactor,
                        debounceTime: Number(t),
                      },
                    })
                  }
                />
              </FormField>
            </View>
            <FormField label="Part Count Type">
              <Select
                options={PartCount_OPTIONS as any}
                value={deviceFormData.partCountType as any}
                onSelect={handlePartCountTypeSelect}
              />
            </FormField>
            {getPartCountTypeValue() === 0 && (
              <FormField label="Part Count Pins">
                <View style={styles.checkboxGrid}>
                  {getDigitalPinOptions().map((option) => {
                    const selected = getSelectedDigitalPins().includes(
                      option.value,
                    );
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.checkboxOption,
                          selected && styles.checkboxOptionActive,
                        ]}
                        onPress={() => handleDigitalPinToggle(option.value)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.checkboxBox,
                            selected && styles.checkboxBoxActive,
                          ]}
                        >
                          {selected && (
                            <Text style={styles.checkboxTick}>✓</Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.checkboxLabel,
                            selected && styles.checkboxLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FormField>
            )}
            {getPartCountTypeValue() === 1 && (
              <FormField label="AI Channel">
                <Select
                  options={AI_CHANNEL_OPTIONS}
                  value={getPerformanceAlgorithmValues()[1]}
                  onSelect={handleSinglePartCountInputSelect}
                  placeholder="Select AI"
                />
              </FormField>
            )}
            {getPartCountTypeValue() === 3 && (
              <FormField label="Other Channel">
                <Select
                  options={OTH_CHANNEL_OPTIONS}
                  value={getPerformanceAlgorithmValues()[1]}
                  onSelect={handleSinglePartCountInputSelect}
                  placeholder="Select Other"
                />
              </FormField>
            )}
            <View style={styles.depSection}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#183f3c",
                    }}
                  >
                    LIST DEP VALUES
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {deviceFormData.performanceFactor?.dep?.length || 0}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[inputStyle.input, { flex: 1, height: 40 }]}
                  placeholder="Enter value"
                  keyboardType="numeric"
                  id="perf_dep_input"
                  onSubmitEditing={(e) => {
                    const val = Number(e.nativeEvent.text);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.performanceFactor?.dep?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        performanceFactor: {
                          ...deviceFormData.performanceFactor,
                          dep: [
                            ...(deviceFormData.performanceFactor.dep || []),
                            val,
                          ],
                        },
                      });
                      (e.target as any).value = "";
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.addValBtn}
                  onPress={() => {
                    const input = document.getElementById(
                      "perf_dep_input",
                    ) as HTMLInputElement;
                    const val = Number(input?.value);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.performanceFactor?.dep?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        performanceFactor: {
                          ...deviceFormData.performanceFactor,
                          dep: [
                            ...(deviceFormData.performanceFactor.dep || []),
                            val,
                          ],
                        },
                      });
                      if (input) input.value = "";
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 18 }}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {deviceFormData.performanceFactor?.dep?.map(
                  (val: number, idx: number) => (
                    <View key={idx} style={styles.valueChip}>
                      <Text style={styles.valueChipText}>{val}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          setDeviceFormData({
                            ...deviceFormData,
                            performanceFactor: {
                              ...deviceFormData.performanceFactor,
                              dep: deviceFormData.performanceFactor.dep.filter(
                                (_: any, i: number) => i !== idx,
                              ),
                            },
                          })
                        }
                      >
                        <Text style={styles.valueChipClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
              </View>
            </View>
          </View>

          {/* IN Pin Configuration */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#7c3aed22" }]}
              >
                <Text style={{ color: "#7c3aed", fontSize: 16 }}>🔌</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.configTitle}>IN Pin Configuration</Text>
                <Text style={styles.configSubtitle}>
                  Input pin scan and post timing
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 12, color: "#5b7773" }}>
                  {deviceFormData.INPin?.enabled === 1 ? "Enabled" : "Disabled"}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setDeviceFormData({
                      ...deviceFormData,
                      INPin: {
                        ...deviceFormData.INPin,
                        enabled: deviceFormData.INPin?.enabled === 1 ? 0 : 1,
                      },
                    })
                  }
                  style={[
                    styles.toggleBase,
                    deviceFormData.INPin?.enabled === 1 && styles.toggleActive,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      deviceFormData.INPin?.enabled === 1 &&
                        styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.configRow}>
              <FormField
                label="Scan Time (ms)"
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.INPin?.scanTime || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      INPin: { ...deviceFormData.INPin, scanTime: Number(t) },
                    })
                  }
                />
              </FormField>
              <FormField
                label="Post Time (s)"
                style={{ flex: 1, minWidth: 200 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.INPin?.postTime || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      INPin: { ...deviceFormData.INPin, postTime: Number(t) },
                    })
                  }
                />
              </FormField>
            </View>
          </View>

          {/* eMIC Configuration */}
          <View
            style={[
              styles.configSection,
              { pointerEvents: isViewOnly ? "none" : "auto" },
            ]}
          >
            <View style={styles.configHeader}>
              <View
                style={[styles.configIcon, { backgroundColor: "#dc262622" }]}
              >
                <Text style={{ color: "#dc2626", fontSize: 16 }}>🔥</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.configTitle}>eMIC Configuration</Text>
                <Text style={styles.configSubtitle}>
                  Energy meter interface controller parameters
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 12, color: "#5b7773" }}>
                  {deviceFormData.eMICConfig?.enabled === 1
                    ? "Enabled"
                    : "Disabled"}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setDeviceFormData({
                      ...deviceFormData,
                      eMICConfig: {
                        ...deviceFormData.eMICConfig,
                        enabled:
                          deviceFormData.eMICConfig?.enabled === 1 ? 0 : 1,
                      },
                    })
                  }
                  style={[
                    styles.toggleBase,
                    deviceFormData.eMICConfig?.enabled === 1 &&
                      styles.toggleActive,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      deviceFormData.eMICConfig?.enabled === 1 &&
                        styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.configRow}>
              <FormField
                label="Post Time (s)"
                style={{ flex: 1, minWidth: 120 }}
              >
                <TextInput
                  style={inputStyle.input}
                  keyboardType="numeric"
                  value={String(deviceFormData.eMICConfig?.postTime || 0)}
                  onChangeText={(t) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      eMICConfig: {
                        ...deviceFormData.eMICConfig,
                        postTime: Number(t),
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Frequency" style={{ flex: 1, minWidth: 120 }}>
                <Select
                  options={[
                    { label: "50 Hz", value: 0 },
                    { label: "60 Hz", value: 1 },
                  ]}
                  value={deviceFormData.eMICConfig?.freq}
                  onSelect={(val) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      eMICConfig: { ...deviceFormData.eMICConfig, freq: val },
                    })
                  }
                />
              </FormField>
              <FormField
                label="Phase Sequence"
                style={{ flex: 1, minWidth: 120 }}
              >
                <Select
                  options={[
                    { label: "1 — 1P2W", value: 1 },
                    { label: "2 — 2P2W", value: 2 },
                    { label: "3 — 3P3W", value: 3 },
                    { label: "4 — 3P4W", value: 4 },
                  ]}
                  value={deviceFormData.eMICConfig?.phaseSeq}
                  onSelect={(val) =>
                    setDeviceFormData({
                      ...deviceFormData,
                      eMICConfig: {
                        ...deviceFormData.eMICConfig,
                        phaseSeq: val,
                      },
                    })
                  }
                />
              </FormField>
            </View>

            {/* CONFIGURATION FACTOR VALUES for eMIC */}
            <View style={styles.depSection}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#183f3c",
                    }}
                  >
                    CONFIGURATION FACTOR VALUES
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>
                      {deviceFormData.eMICConfig?.cngfFactor?.length || 0}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <TextInput
                  style={[inputStyle.input, { flex: 1, height: 40 }]}
                  placeholder="Enter value"
                  keyboardType="numeric"
                  id="emic_cngf_input"
                  onSubmitEditing={(e) => {
                    const val = Number(e.nativeEvent.text);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.eMICConfig?.cngfFactor?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        eMICConfig: {
                          ...deviceFormData.eMICConfig,
                          cngfFactor: [
                            ...(deviceFormData.eMICConfig.cngfFactor || []),
                            val,
                          ],
                        },
                      });
                      (e.target as any).value = "";
                    }
                  }}
                />
                <TouchableOpacity
                  style={styles.addValBtn}
                  onPress={() => {
                    const input = document.getElementById(
                      "emic_cngf_input",
                    ) as HTMLInputElement;
                    const val = Number(input?.value);
                    if (
                      !isNaN(val) &&
                      (deviceFormData.eMICConfig?.cngfFactor?.length || 0) < 10
                    ) {
                      setDeviceFormData({
                        ...deviceFormData,
                        eMICConfig: {
                          ...deviceFormData.eMICConfig,
                          cngfFactor: [
                            ...(deviceFormData.eMICConfig.cngfFactor || []),
                            val,
                          ],
                        },
                      });
                      if (input) input.value = "";
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 18 }}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {deviceFormData.eMICConfig?.cngfFactor?.map(
                  (val: number, idx: number) => (
                    <View key={idx} style={styles.valueChip}>
                      <Text style={styles.valueChipText}>{val}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          setDeviceFormData({
                            ...deviceFormData,
                            eMICConfig: {
                              ...deviceFormData.eMICConfig,
                              cngfFactor:
                                deviceFormData.eMICConfig.cngfFactor.filter(
                                  (_: any, i: number) => i !== idx,
                                ),
                            },
                          })
                        }
                      >
                        <Text style={styles.valueChipClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
              </View>
            </View>
          </View>
        </FormModal>

        {/* Gateway Master Modal */}
        <FormModal
          visible={showGatewayModal}
          title={gatewayFormData._id ? "Edit Gateway" : "Add Gateway"}
          onClose={() => setShowGatewayModal(false)}
          onSave={handleSaveGateway}
        >
          <FormField label="Gateway ID" required>
            <TextInput
              style={inputStyle.input}
              value={gatewayFormData.gatewayId}
              onChangeText={(t) =>
                setGatewayFormData({ ...gatewayFormData, gatewayId: t })
              }
            />
          </FormField>
          <FormField label="Name" required>
            <TextInput
              style={inputStyle.input}
              value={gatewayFormData.name}
              onChangeText={(t) =>
                setGatewayFormData({ ...gatewayFormData, name: t })
              }
            />
          </FormField>
        </FormModal>

        {/* OTA Modal */}
        <FormModal
          visible={showOTAModal}
          title={otaFormData._id ? "Edit OTA Config" : "Upload OTA Firmware"}
          onClose={() => {
            setShowOTAModal(false);
            setOtaFormData({});
          }}
          onSave={handleSaveOTA}
        >
          <FormField label="File Name *" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. GatewayAppV2_0_0"
              value={otaFormData.fileName || ""}
              onChangeText={(t) =>
                setOtaFormData({ ...otaFormData, fileName: t })
              }
            />
          </FormField>
          <FormField label="Version *" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. 2.0.0"
              value={otaFormData.version || ""}
              onChangeText={(t) =>
                setOtaFormData({ ...otaFormData, version: t })
              }
            />
          </FormField>
          <FormField
            label={
              otaFormData._id
                ? ".bin File (leave empty to keep existing)"
                : ".bin File *"
            }
          >
            {/* Web file picker */}
            <TouchableOpacity
              style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: otaFormData._selectedFile ? "#16a34a" : "#7a9692",
                borderRadius: 10,
                padding: 18,
                alignItems: "center",
                backgroundColor: otaFormData._selectedFile
                  ? "#f0fdf4"
                  : "#f7fbfa",
              }}
              onPress={() => {
                if (typeof document !== "undefined") {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".bin";
                  input.onchange = (e: any) => {
                    const file: File = e.target.files?.[0];
                    if (!file) return;
                    if (!file.name.toLowerCase().endsWith(".bin")) {
                      showToast({
                        message: "Only .bin files are allowed.",
                        type: "warning",
                      });
                      return;
                    }
                    setOtaFormData((prev) => ({
                      ...prev,
                      _selectedFile: file,
                      fileName:
                        prev.fileName || file.name.replace(/\.bin$/i, ""),
                    }));
                  };
                  input.click();
                }
              }}
            >
              {otaFormData._selectedFile ? (
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 20 }}>✅</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#16a34a",
                    }}
                  >
                    {otaFormData._selectedFile.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#5b7773" }}>
                    {(otaFormData._selectedFile.size / 1024).toFixed(1)} KB
                  </Text>
                  <Text style={{ fontSize: 11, color: "#7a9692" }}>
                    Tap to change
                  </Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 24 }}>📁</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: "#486966",
                    }}
                  >
                    Click to select .bin file
                  </Text>
                  <Text style={{ fontSize: 12, color: "#7a9692" }}>
                    Supported format: .bin • Max 50 MB
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </FormField>
        </FormModal>

        {/* Department Modal */}
        <FormModal
          visible={showDeptModal}
          title="Department"
          onClose={() => setShowDeptModal(false)}
          onSave={handleSaveDept}
        >
          <FormField label="Dept ID" required>
            <TextInput
              style={inputStyle.input}
              value={deptFormData.departmentId}
              onChangeText={(t) =>
                setDeptFormData({ ...deptFormData, departmentId: t })
              }
            />
          </FormField>
          <FormField label="Name" required>
            <TextInput
              style={inputStyle.input}
              value={deptFormData.departmentName}
              onChangeText={(t) =>
                setDeptFormData({ ...deptFormData, departmentName: t })
              }
            />
          </FormField>
        </FormModal>

        {/* Machine Type Modal */}
        <FormModal
          visible={showMachineTypeModal}
          title={mtFormData._id ? "Edit Machine Type" : "Add Machine Type"}
          onClose={() => {
            setShowMachineTypeModal(false);
            setMtFormData({});
          }}
          onSave={handleSaveMachineType}
        >
          <FormField label="Process Category" required>
            <Select
              placeholder="Select process this machine is used for"
              value={mtFormData.processCategory || ""}
              options={processes
                .filter(
                  (p) =>
                    !["COATING", "FINAL_QA"].includes(
                      String(p.processId || "").toUpperCase(),
                    ),
                )
                .map((p) => ({ label: p.processName, value: p.processId }))}
              onSelect={(val) =>
                setMtFormData({ ...mtFormData, processCategory: val })
              }
              inline
            />
          </FormField>
          <FormField label="Machine Type / Model Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Toshiba DC-200, FANUC CNC-500"
              value={mtFormData.machineType || ""}
              onChangeText={(t) =>
                setMtFormData({ ...mtFormData, machineType: t })
              }
            />
          </FormField>
          <FormField label="Description (Optional)">
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. 200T Cold Chamber Die Casting Machine"
              value={mtFormData.description || ""}
              onChangeText={(t) =>
                setMtFormData({ ...mtFormData, description: t })
              }
            />
          </FormField>
        </FormModal>

        {/* Reason Modal */}
        <FormModal
          visible={showReasonModal}
          title={reasonFormData._id ? "Edit Reason" : "Add Quality Reason"}
          onClose={() => {
            setShowReasonModal(false);
            setReasonFormData({});
          }}
          onSave={handleSaveReason}
        >
          <FormField label="Category" required>
            <Select
              placeholder="Select Category"
              value={reasonFormData.category}
              options={[
                { label: "❌ Rejection", value: "REJECTION" },
                { label: "🔄 Rework", value: "REWORK" },
                { label: "🗑️ Scrap", value: "SCRAP" },
                { label: "⏸️ Downtime", value: "DOWNTIME" },
              ]}
              onSelect={(v) =>
                setReasonFormData({
                  ...reasonFormData,
                  category: v,
                  reasonType: v,
                  reason_type: v,
                })
              }
              inline
            />
          </FormField>
          <FormField label="Applicable Process" required>
            <Select
              placeholder="Select Process"
              value={
                reasonFormData.type ||
                reasonFormData.processType ||
                reasonFormData.processCategory ||
                reasonFormData.stageType
              }
              options={[
                ...processes.map((p) => ({
                  label: p.processName,
                  value: p.processId,
                })),
                { label: "🌐 All Processes", value: "ALL" },
              ]}
              onSelect={(v) =>
                setReasonFormData({
                  ...reasonFormData,
                  type: v,
                  processType: v,
                  processCategory: v,
                  stageType: v,
                })
              }
              inline
            />
          </FormField>
          <FormField label="Reason Code (Optional)">
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. R01"
              value={reasonFormData.reasonCode}
              onChangeText={(t) =>
                setReasonFormData({ ...reasonFormData, reasonCode: t })
              }
            />
          </FormField>
          <FormField label="Reason Description" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Surface Crack"
              value={reasonFormData.reason}
              onChangeText={(t) =>
                setReasonFormData({ ...reasonFormData, reason: t })
              }
            />
          </FormField>

          <View
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: "#f7fbfa",
              borderRadius: 8,
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
              onPress={() =>
                setReasonFormData({
                  ...reasonFormData,
                  requiresSubReason: !reasonFormData.requiresSubReason,
                })
              }
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: "#00877f",
                  backgroundColor: reasonFormData.requiresSubReason
                    ? "#00877f"
                    : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {reasonFormData.requiresSubReason && (
                  <Text style={{ color: "#fff", fontSize: 14 }}>✓</Text>
                )}
              </View>
              <Text style={{ fontWeight: "700", color: "#183f3c" }}>
                Requires Sub-Reason?
              </Text>
            </TouchableOpacity>

            {reasonFormData.requiresSubReason && (
              <View>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: "#5b7773",
                    marginBottom: 8,
                  }}
                >
                  Sub-Reasons List
                </Text>
                {(reasonFormData.subReason || []).map(
                  (sr: any, idx: number) => (
                    <View
                      key={idx}
                      style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}
                    >
                      <TextInput
                        style={[inputStyle.input, { flex: 1 }]}
                        placeholder="Sub-reason label"
                        value={sr.label}
                        onChangeText={(t) => {
                          const newSR = [...(reasonFormData.subReason || [])];
                          newSR[idx] = {
                            ...newSR[idx],
                            label: t,
                            value: t.toUpperCase().replace(/\s/g, "_"),
                          };
                          setReasonFormData({
                            ...reasonFormData,
                            subReason: newSR,
                          });
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          const newSR = [...(reasonFormData.subReason || [])];
                          newSR.splice(idx, 1);
                          setReasonFormData({
                            ...reasonFormData,
                            subReason: newSR,
                          });
                        }}
                      >
                        <Text
                          style={{
                            color: "#ef4444",
                            fontWeight: "bold",
                            padding: 8,
                          }}
                        >
                          ✕
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
                <TouchableOpacity
                  style={{
                    backgroundColor: "#fff",
                    borderStyle: "dashed",
                    borderWidth: 1,
                    borderColor: "#c8dbd8",
                    padding: 8,
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                  onPress={() => {
                    const existing = reasonFormData.subReason || [];
                    if (existing.some((sr: any) => !sr.label?.trim())) {
                      showToast({
                        message:
                          "Fill in the existing Sub-Reason before adding another.",
                        type: "warning",
                      });
                      return;
                    }
                    setReasonFormData({
                      ...reasonFormData,
                      subReason: [...existing, { label: "", value: "" }],
                    });
                  }}
                >
                  <Text
                    style={{
                      color: "#5b7773",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    + Add Sub-Reason
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </FormModal>

        {/* Process Management Modal */}
        <FormModal
          visible={showProcessModal}
          title="Process Management"
          subtitle="Add, arrange and configure your production processes"
          onClose={() => setShowProcessModal(false)}
          onSave={handleSaveProcess}
          saveLabel="Save Workflow"
          maxWidth={580}
        >
          {/* ── Quick-add standard presets ── */}
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: "#5b7773",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Quick Add — Standard Processes
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {STANDARD_PROCESSES.map((p) => {
                const alreadyAdded = (processFormData.items || []).some(
                  (it: any) => it.processId === p.processId,
                );
                return (
                  <TouchableOpacity
                    key={p.processId}
                    disabled={alreadyAdded}
                    onPress={() => {
                      const items = [...(processFormData.items || [])];
                      items.push({
                        processId: p.processId,
                        processName: p.processName,
                        operation: p.operation,
                        isMultiMachine: p.isMultiMachine,
                      });
                      setProcessFormData({ ...processFormData, items });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: alreadyAdded ? "#d7e6e4" : p.color,
                      backgroundColor: alreadyAdded
                        ? "#f7fbfa"
                        : `${p.color}15`,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: alreadyAdded ? "#7a9692" : p.color,
                        fontWeight: "700",
                      }}
                    >
                      {p.icon} {p.processName}
                    </Text>
                    {!alreadyAdded && (
                      <Text
                        style={{
                          fontSize: 16,
                          color: p.color,
                          fontWeight: "800",
                        }}
                      >
                        +
                      </Text>
                    )}
                    {alreadyAdded && (
                      <Text style={{ fontSize: 12, color: "#7a9692" }}>✓</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Add custom process ── */}
          <View
            style={{
              padding: 14,
              backgroundColor: "#f7fbfa",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#d7e6e4",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: "#5b7773",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Add Custom Process
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <FormField label="Process Name *" containerStyle={{ flex: 1 }}>
                <TextInput
                  style={inputStyle.input}
                  placeholder="e.g. Milling"
                  value={processFormData.newProcess?.processName || ""}
                  onChangeText={(t) =>
                    setProcessFormData({
                      ...processFormData,
                      newProcess: {
                        ...(processFormData.newProcess || {}),
                        processName: t,
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Operation" containerStyle={{ flex: 1 }}>
                <TextInput
                  style={inputStyle.input}
                  placeholder="e.g. Milling Process"
                  value={processFormData.newProcess?.operation || ""}
                  onChangeText={(t) =>
                    setProcessFormData({
                      ...processFormData,
                      newProcess: {
                        ...(processFormData.newProcess || {}),
                        operation: t,
                      },
                    })
                  }
                />
              </FormField>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  const np = processFormData.newProcess || {};
                  setProcessFormData({
                    ...processFormData,
                    newProcess: { ...np, isMultiMachine: !np.isMultiMachine },
                  });
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: processFormData.newProcess?.isMultiMachine
                      ? "#006b65"
                      : "#c8dbd8",
                    backgroundColor: processFormData.newProcess?.isMultiMachine
                      ? "#006b65"
                      : "#fff",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {processFormData.newProcess?.isMultiMachine && (
                    <Text
                      style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}
                    >
                      ✓
                    </Text>
                  )}
                </View>
                <Text
                  style={{ fontSize: 13, color: "#486966", fontWeight: "600" }}
                >
                  Supports Multi-Machine Split
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const np = processFormData.newProcess || {};
                  if (!np.processName?.trim()) {
                    showToast({
                      message: "Process name is required.",
                      type: "warning",
                    });
                    return;
                  }
                  const items = [...(processFormData.items || [])];
                  items.push({
                    processName: np.processName.trim(),
                    operation: np.operation?.trim() || "",
                    isMultiMachine: !!np.isMultiMachine,
                  });
                  setProcessFormData({
                    ...processFormData,
                    items,
                    newProcess: {
                      processName: "",
                      operation: "",
                      isMultiMachine: false,
                    },
                  });
                }}
                style={{
                  backgroundColor: "#006b65",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                }}
              >
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}
                >
                  + Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Configured process list with reorder ── */}
          {(processFormData.items || []).length > 0 && (
            <View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#5b7773",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Configured Workflow ({(processFormData.items || []).length}{" "}
                processes)
              </Text>
              {(processFormData.items || []).map((item: any, idx: number) => {
                const preset = STANDARD_PROCESSES.find(
                  (p) => p.processId === item.processId,
                );
                const color = preset?.color || "#486966";
                const items: any[] = processFormData.items || [];
                return (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#d7e6e4",
                      backgroundColor: "#ffffff",
                      marginBottom: 8,
                    }}
                  >
                    {/* Order badge */}
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: color,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "900",
                          fontSize: 15,
                        }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#083d3a",
                        }}
                      >
                        {item.processName}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#5b7773" }}>
                        {item.operation || "—"}
                      </Text>
                    </View>
                    {/* Multi-machine badge */}
                    <View
                      style={{
                        backgroundColor: item.isMultiMachine
                          ? "#dcfce7"
                          : "#edf5f4",
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: item.isMultiMachine ? "#166534" : "#7a9692",
                        }}
                      >
                        {item.isMultiMachine ? "Multi" : "Single"}
                      </Text>
                    </View>
                    {/* Up / Down */}
                    <TouchableOpacity
                      disabled={idx === 0}
                      onPress={() => {
                        const arr = [...items];
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        setProcessFormData({ ...processFormData, items: arr });
                      }}
                      style={{
                        backgroundColor: idx === 0 ? "#edf5f4" : "#d7e6e4",
                        borderRadius: 6,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: idx === 0 ? "#c8dbd8" : "#486966",
                          fontWeight: "800",
                        }}
                      >
                        ↑
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={idx === items.length - 1}
                      onPress={() => {
                        const arr = [...items];
                        [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                        setProcessFormData({ ...processFormData, items: arr });
                      }}
                      style={{
                        backgroundColor:
                          idx === items.length - 1 ? "#edf5f4" : "#d7e6e4",
                        borderRadius: 6,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            idx === items.length - 1 ? "#c8dbd8" : "#486966",
                          fontWeight: "800",
                        }}
                      >
                        ↓
                      </Text>
                    </TouchableOpacity>
                    {/* Delete */}
                    <TouchableOpacity
                      onPress={() => {
                        const arr = items.filter(
                          (_: any, i: number) => i !== idx,
                        );
                        setProcessFormData({ ...processFormData, items: arr });
                      }}
                      style={{
                        backgroundColor: "#fee2e2",
                        borderRadius: 6,
                        width: 28,
                        height: 28,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#dc2626", fontWeight: "800" }}>
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty state */}
          {(processFormData.items || []).length === 0 && (
            <View
              style={{
                padding: 24,
                alignItems: "center",
                backgroundColor: "#f7fbfa",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#d7e6e4",
                borderStyle: "dashed",
              }}
            >
              <Text
                style={{ fontSize: 13, color: "#7a9692", fontWeight: "600" }}
              >
                No processes added yet. Use the presets or add a custom process
                above.
              </Text>
            </View>
          )}
        </FormModal>

        {/* Program Modal */}
        <FormModal
          visible={showProgramModal}
          title="Program Master"
          onClose={() => setShowProgramModal(false)}
          onSave={handleSaveProgram}
          maxWidth={800}
        >
          <View style={{ flexDirection: "row", gap: 12 }}>
            <FormField
              label="Program ID *"
              required
              containerStyle={{ flex: 1 }}
            >
              <TextInput
                style={[
                  inputStyle.input,
                  { backgroundColor: "#edf5f4", color: "#5b7773" },
                ]}
                value={programFormData.programId}
                editable={false}
              />
            </FormField>
            <FormField
              label="Program Code"
              required
              containerStyle={{ flex: 1 }}
            >
              <TextInput
                style={inputStyle.input}
                placeholder="e.g. EB-001"
                value={programFormData.programCode}
                onChangeText={(t) =>
                  setProgramFormData({ ...programFormData, programCode: t })
                }
              />
            </FormField>
          </View>

          <FormField label="Program Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Engine Block A"
              value={programFormData.programName}
              onChangeText={(t) =>
                setProgramFormData({ ...programFormData, programName: t })
              }
            />
          </FormField>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <FormField label="Program Type" containerStyle={{ flex: 1 }}>
              <Select
                value={
                  programFormData.programType || programFormData.processCategory
                }
                options={processes.map((p) => ({
                  label: p.processName,
                  value: p.processId,
                }))}
                onSelect={(v) =>
                  setProgramFormData({
                    ...programFormData,
                    programType: v,
                    processCategory: v,
                  })
                }
                placeholder="Select Type"
              />
            </FormField>
            <FormField label="Department" containerStyle={{ flex: 1 }}>
              <Select
                value={programFormData.department}
                options={departments.map((d) => ({
                  label: d.departmentName,
                  value: d.departmentName,
                }))}
                onSelect={(v) =>
                  setProgramFormData({ ...programFormData, department: v })
                }
                placeholder="Select Department"
              />
            </FormField>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <FormField label="Op Sequence" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(programFormData.operationSequence || 1)}
                onChangeText={(t) =>
                  setProgramFormData({
                    ...programFormData,
                    operationSequence: Number(t),
                  })
                }
              />
            </FormField>
            <FormField label="Total Ops" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(programFormData.totalOperations || 1)}
                onChangeText={(t) =>
                  setProgramFormData({
                    ...programFormData,
                    totalOperations: Number(t),
                  })
                }
              />
            </FormField>
            <FormField label="No. of Cavities" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(programFormData.numberOfCavities || 1)}
                onChangeText={(t) =>
                  setProgramFormData({
                    ...programFormData,
                    numberOfCavities: Number(t),
                  })
                }
              />
            </FormField>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <FormField
              label="Weight Per Part (Kg)"
              containerStyle={{ flex: 1 }}
            >
              <TextInput
                style={inputStyle.input}
                keyboardType="decimal-pad"
                value={String(programFormData.weightPerPart ?? "")}
                onChangeText={(t) =>
                  setProgramFormData({ ...programFormData, weightPerPart: t })
                }
              />
            </FormField>
            <FormField label="Price Per Part" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                keyboardType="decimal-pad"
                value={String(programFormData.pricePerPart ?? "")}
                onChangeText={(t) =>
                  setProgramFormData({ ...programFormData, pricePerPart: t })
                }
              />
            </FormField>
          </View>

          <Text
            style={{
              fontWeight: "bold",
              marginTop: 16,
              marginBottom: 8,
              fontSize: 16,
              color: "#183f3c",
            }}
          >
            Cycle time configuration
          </Text>
          {(programFormData.process || []).map((p: any, idx: number) => (
            <View
              key={idx}
              style={{
                backgroundColor: "#f7fbfa",
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: "#d7e6e4",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontWeight: "bold", color: "#315451" }}>
                  {p.processName || "Process"} ({p.processId})
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newP = [...(programFormData.process || [])];
                    newP.splice(idx, 1);
                    setProgramFormData({ ...programFormData, process: newP });
                  }}
                >
                  <Text style={{ color: "#ef4444", fontWeight: "bold" }}>
                    Remove
                  </Text>
                </TouchableOpacity>
              </View>

              <FormField label="Operations (Comma separated)">
                <TextInput
                  style={inputStyle.input}
                  placeholder="Milling, Drilling"
                  value={(p.operations || []).join(", ")}
                  onChangeText={(t) => {
                    const newP = [...(programFormData.process || [])];
                    newP[idx].operations = t.split(",").map((s) => s.trim());
                    setProgramFormData({ ...programFormData, process: newP });
                  }}
                />
              </FormField>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 12, color: "#5b7773", marginBottom: 4 }}
                  >
                    Loading (s)
                  </Text>
                  <TextInput
                    style={inputStyle.input}
                    keyboardType="decimal-pad"
                    value={String(p.cycleTime?.loadingTime ?? "")}
                    onChangeText={(t) => {
                      const newP = [...(programFormData.process || [])];
                      if (!newP[idx].cycleTime) newP[idx].cycleTime = {};
                      newP[idx].cycleTime.loadingTime = t;
                      newP[idx].cycleTime.totalCycleTimeSeconds =
                        (parseFloat(String(newP[idx].cycleTime.loadingTime)) ||
                          0) +
                        (parseFloat(String(newP[idx].cycleTime.runTime)) || 0) +
                        (parseFloat(
                          String(newP[idx].cycleTime.unloadingTime),
                        ) || 0);
                      setProgramFormData({ ...programFormData, process: newP });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 12, color: "#5b7773", marginBottom: 4 }}
                  >
                    Run (s)
                  </Text>
                  <TextInput
                    style={inputStyle.input}
                    keyboardType="decimal-pad"
                    value={String(p.cycleTime?.runTime ?? "")}
                    onChangeText={(t) => {
                      const newP = [...(programFormData.process || [])];
                      if (!newP[idx].cycleTime) newP[idx].cycleTime = {};
                      newP[idx].cycleTime.runTime = t;
                      newP[idx].cycleTime.totalCycleTimeSeconds =
                        (parseFloat(String(newP[idx].cycleTime.loadingTime)) ||
                          0) +
                        (parseFloat(String(newP[idx].cycleTime.runTime)) || 0) +
                        (parseFloat(
                          String(newP[idx].cycleTime.unloadingTime),
                        ) || 0);
                      setProgramFormData({ ...programFormData, process: newP });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 12, color: "#5b7773", marginBottom: 4 }}
                  >
                    Unloading (s)
                  </Text>
                  <TextInput
                    style={inputStyle.input}
                    keyboardType="decimal-pad"
                    value={String(p.cycleTime?.unloadingTime ?? "")}
                    onChangeText={(t) => {
                      const newP = [...(programFormData.process || [])];
                      if (!newP[idx].cycleTime) newP[idx].cycleTime = {};
                      newP[idx].cycleTime.unloadingTime = t;
                      newP[idx].cycleTime.totalCycleTimeSeconds =
                        (parseFloat(String(newP[idx].cycleTime.loadingTime)) ||
                          0) +
                        (parseFloat(String(newP[idx].cycleTime.runTime)) || 0) +
                        (parseFloat(
                          String(newP[idx].cycleTime.unloadingTime),
                        ) || 0);
                      setProgramFormData({ ...programFormData, process: newP });
                    }}
                  />
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 12,
                  marginTop: 12,
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 12, color: "#5b7773", marginBottom: 4 }}
                  >
                    Parts Per Cycle
                  </Text>
                  <TextInput
                    style={inputStyle.input}
                    keyboardType="decimal-pad"
                    value={String(p.partsPerCycle ?? "")}
                    onChangeText={(t) => {
                      const newP = [...(programFormData.process || [])];
                      newP[idx].partsPerCycle = t;
                      setProgramFormData({ ...programFormData, process: newP });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 12, color: "#5b7773", marginBottom: 4 }}
                  >
                    Total Cycle (s)
                  </Text>
                  <TextInput
                    style={[inputStyle.input, { backgroundColor: "#edf5f4" }]}
                    editable={false}
                    value={String(p.cycleTime?.totalCycleTimeSeconds || 0)}
                  />
                </View>
              </View>
            </View>
          ))}
          {(programFormData.process || []).length === 0 && (
            <Select
              label="+ Add Cycle time configuration"
              options={processes.map((p) => ({
                label: p.processName,
                value: p.processId,
              }))}
              value=""
              onSelect={(val) => {
                const proc = processes.find((p) => p.processId === val);
                if (proc) {
                  setProgramFormData({
                    ...programFormData,
                    process: [
                      {
                        processId: proc.processId,
                        processName: proc.processName,
                        operations: [],
                        selectType: "CycleTime",
                        cycleTime: {
                          loadingTime: 0,
                          runTime: 0,
                          unloadingTime: 0,
                          totalCycleTimeSeconds: 0,
                        },
                        selectPartType: "PartsPerCycle",
                        partsPerCycle: 1,
                      },
                    ],
                  });
                }
              }}
            />
          )}
        </FormModal>

        {/* Vendor Modal */}
        <FormModal
          visible={showVendorModal}
          title="Vendor Management"
          onClose={() => setShowVendorModal(false)}
          onSave={handleSaveVendor}
        >
          <FormField label="Vendor ID *" required>
            <TextInput
              style={[
                inputStyle.input,
                { backgroundColor: "#edf5f4", color: "#5b7773" },
              ]}
              value={vendorFormData.vendorId}
              editable={false}
            />
          </FormField>
          <FormField label="Vendor Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Acme Casting"
              value={vendorFormData.vendorName}
              onChangeText={(t) =>
                setVendorFormData({ ...vendorFormData, vendorName: t })
              }
            />
          </FormField>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <FormField label="City" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                placeholder="e.g. Pune"
                value={vendorFormData.city}
                onChangeText={(t) =>
                  setVendorFormData({ ...vendorFormData, city: t })
                }
              />
            </FormField>
            <FormField label="Area" containerStyle={{ flex: 1 }}>
              <TextInput
                style={inputStyle.input}
                placeholder="e.g. Chakan"
                value={vendorFormData.area}
                onChangeText={(t) =>
                  setVendorFormData({ ...vendorFormData, area: t })
                }
              />
            </FormField>
          </View>
        </FormModal>

        {/* Operator Modal */}
        <FormModal
          visible={showOperatorModal}
          title="Operator"
          onClose={() => setShowOperatorModal(false)}
          onSave={handleSaveOperator}
        >
          <FormField label="Employee ID *" required>
            <TextInput
              style={[
                inputStyle.input,
                { backgroundColor: "#edf5f4", color: "#5b7773" },
              ]}
              value={operatorFormData.operatorId}
              editable={false}
            />
          </FormField>
          <FormField label="Full Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="Operator Name"
              value={operatorFormData.name}
              onChangeText={(t) =>
                setOperatorFormData({ ...operatorFormData, name: t })
              }
            />
          </FormField>
          <FormField label="Assigned Process" required>
            <Select
              value={operatorFormData.process}
              options={[
                ...processes.map((p) => ({
                  label: p.processName,
                  value: p.processId,
                })),
                { label: "All Processes", value: "ALL" },
              ]}
              onSelect={(v) =>
                setOperatorFormData({ ...operatorFormData, process: v })
              }
              placeholder="Select Process"
            />
          </FormField>
        </FormModal>

        {/* Device Detailed Config Modal */}
        <FormModal
          visible={showDeviceConfigModal}
          title={`Configure ${deviceFormData.gatewayName || "Device"}`}
          onClose={() => setShowDeviceConfigModal(false)}
          onSave={async () => {
            const ok = await DataStorage.updateDevice(deviceFormData._id, {
              ...deviceFormData,
              ...deviceConfigData,
            });
            if (ok) {
              await loadData();
              setShowDeviceConfigModal(false);
              showToast({ message: "Config saved.", type: "success" });
            }
          }}
        >
          <ScrollView style={{ maxHeight: 500 }}>
            <Text
              style={{ fontWeight: "bold", marginBottom: 8, color: "#183f3c" }}
            >
              Availability Factors
            </Text>
            <Select
              label="Type"
              options={[
                { label: "Single", value: "SINGLE" },
                { label: "Multiple", value: "MULTIPLE" },
              ]}
              value={deviceConfigData.avbFactor?.type}
              onSelect={(val) =>
                setDeviceConfigData({
                  ...deviceConfigData,
                  avbFactor: { ...deviceConfigData.avbFactor, type: val },
                })
              }
            />
            <FormField label="Value">
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(deviceConfigData.avbFactor?.value || 0)}
                onChangeText={(t) =>
                  setDeviceConfigData({
                    ...deviceConfigData,
                    avbFactor: {
                      ...deviceConfigData.avbFactor,
                      value: Number(t),
                    },
                  })
                }
              />
            </FormField>

            {deviceConfigData.avbFactor?.type === "MULTIPLE" && (
              <View
                style={{
                  marginLeft: 16,
                  borderLeftWidth: 2,
                  borderLeftColor: "#d7e6e4",
                  paddingLeft: 8,
                }}
              >
                {(deviceConfigData.avbFactor?.factors || []).map(
                  (f: any, i: number) => (
                    <View
                      key={i}
                      style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}
                    >
                      <TextInput
                        style={[inputStyle.input, { flex: 1 }]}
                        placeholder="Fctr"
                        value={String(f)}
                        onChangeText={(t) => {
                          const nf = [...deviceConfigData.avbFactor.factors];
                          nf[i] = Number(t);
                          setDeviceConfigData({
                            ...deviceConfigData,
                            avbFactor: {
                              ...deviceConfigData.avbFactor,
                              factors: nf,
                            },
                          });
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          const nf = [...deviceConfigData.avbFactor.factors];
                          nf.splice(i, 1);
                          setDeviceConfigData({
                            ...deviceConfigData,
                            avbFactor: {
                              ...deviceConfigData.avbFactor,
                              factors: nf,
                            },
                          });
                        }}
                      >
                        <Text style={{ color: "red" }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
                <TouchableOpacity
                  onPress={() =>
                    setDeviceConfigData({
                      ...deviceConfigData,
                      avbFactor: {
                        ...deviceConfigData.avbFactor,
                        factors: [
                          ...(deviceConfigData.avbFactor.factors || []),
                          0,
                        ],
                      },
                    })
                  }
                >
                  <Text style={{ color: "#00877f", fontSize: 12 }}>
                    + Add Factor
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={{
                height: 1,
                backgroundColor: "#d7e6e4",
                marginVertical: 16,
              }}
            />

            <Text
              style={{ fontWeight: "bold", marginBottom: 8, color: "#183f3c" }}
            >
              Performance Factors
            </Text>
            <Select
              label="Type"
              options={[
                { label: "Single", value: "SINGLE" },
                { label: "Multiple", value: "MULTIPLE" },
              ]}
              value={deviceConfigData.performanceFactor?.type}
              onSelect={(val) =>
                setDeviceConfigData({
                  ...deviceConfigData,
                  performanceFactor: {
                    ...deviceConfigData.performanceFactor,
                    type: val,
                  },
                })
              }
            />
            <FormField label="Value">
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(deviceConfigData.performanceFactor?.value || 0)}
                onChangeText={(t) =>
                  setDeviceConfigData({
                    ...deviceConfigData,
                    performanceFactor: {
                      ...deviceConfigData.performanceFactor,
                      value: Number(t),
                    },
                  })
                }
              />
            </FormField>

            {deviceConfigData.performanceFactor?.type === "MULTIPLE" && (
              <View
                style={{
                  marginLeft: 16,
                  borderLeftWidth: 2,
                  borderLeftColor: "#d7e6e4",
                  paddingLeft: 8,
                }}
              >
                {(deviceConfigData.performanceFactor?.factors || []).map(
                  (f: any, i: number) => (
                    <View
                      key={i}
                      style={{ flexDirection: "row", gap: 4, marginBottom: 4 }}
                    >
                      <TextInput
                        style={[inputStyle.input, { flex: 1 }]}
                        placeholder="Fctr"
                        value={String(f)}
                        onChangeText={(t) => {
                          const nf = [
                            ...deviceConfigData.performanceFactor.factors,
                          ];
                          nf[i] = Number(t);
                          setDeviceConfigData({
                            ...deviceConfigData,
                            performanceFactor: {
                              ...deviceConfigData.performanceFactor,
                              factors: nf,
                            },
                          });
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          const nf = [
                            ...deviceConfigData.performanceFactor.factors,
                          ];
                          nf.splice(i, 1);
                          setDeviceConfigData({
                            ...deviceConfigData,
                            performanceFactor: {
                              ...deviceConfigData.performanceFactor,
                              factors: nf,
                            },
                          });
                        }}
                      >
                        <Text style={{ color: "red" }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ),
                )}
                <TouchableOpacity
                  onPress={() =>
                    setDeviceConfigData({
                      ...deviceConfigData,
                      performanceFactor: {
                        ...deviceConfigData.performanceFactor,
                        factors: [
                          ...(deviceConfigData.performanceFactor.factors || []),
                          0,
                        ],
                      },
                    })
                  }
                >
                  <Text style={{ color: "#00877f", fontSize: 12 }}>
                    + Add Factor
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={{
                height: 1,
                backgroundColor: "#d7e6e4",
                marginVertical: 16,
              }}
            />

            <Text
              style={{ fontWeight: "bold", marginBottom: 8, color: "#183f3c" }}
            >
              INPin Factors
            </Text>
            <Select
              label="Type"
              options={[
                { label: "Single", value: "SINGLE" },
                { label: "Multiple", value: "MULTIPLE" },
              ]}
              value={deviceConfigData.INPin?.type}
              onSelect={(val) =>
                setDeviceConfigData({
                  ...deviceConfigData,
                  INPin: { ...deviceConfigData.INPin, type: val },
                })
              }
            />
            <FormField label="Value">
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(deviceConfigData.INPin?.value || 0)}
                onChangeText={(t) =>
                  setDeviceConfigData({
                    ...deviceConfigData,
                    INPin: { ...deviceConfigData.INPin, value: Number(t) },
                  })
                }
              />
            </FormField>

            <View
              style={{
                height: 1,
                backgroundColor: "#d7e6e4",
                marginVertical: 16,
              }}
            />

            <Text
              style={{ fontWeight: "bold", marginBottom: 8, color: "#183f3c" }}
            >
              eMIC Configuration
            </Text>
            <FormField label="Value">
              <TextInput
                style={inputStyle.input}
                keyboardType="numeric"
                value={String(deviceConfigData.eMICConfig?.value || 0)}
                onChangeText={(t) =>
                  setDeviceConfigData({
                    ...deviceConfigData,
                    eMICConfig: { value: Number(t) },
                  })
                }
              />
            </FormField>
          </ScrollView>
        </FormModal>

        {/* Material Master Modal */}
        <FormModal
          visible={showMaterialModal}
          title={editId ? "Edit Material" : "Add New Material"}
          onClose={() => {
            setShowMaterialModal(false);
            setMaterialFormData({});
            setEditId(null);
          }}
          onSave={handleSaveMaterial}
          saveLabel={editId ? "Update" : "Save Material"}
        >
          <FormField label="Material ID" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. MAT001"
              value={materialFormData.materialId}
              onChangeText={(t) =>
                setMaterialFormData({ ...materialFormData, materialId: t })
              }
            />
          </FormField>
          <FormField label="Material Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Aluminum 6061"
              value={materialFormData.materialName}
              onChangeText={(t) =>
                setMaterialFormData({ ...materialFormData, materialName: t })
              }
            />
          </FormField>
          <FormField label="Grade" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. A, B, or Special Grade"
              value={materialFormData.materialGrades?.[0] || ""}
              onChangeText={(val) =>
                setMaterialFormData({
                  ...materialFormData,
                  materialGrades: [val],
                })
              }
            />
          </FormField>
          <FormField label="Unit of Measurement (UOM)">
            <Select
              placeholder="Select UOM"
              value={materialFormData.uom || "KG"}
              options={[
                { label: "KG (Kilograms)", value: "KG" },
                { label: "Ton", value: "TON" },
                { label: "Litre", value: "LITRE" },
                { label: "Pcs (Pieces)", value: "PCS" },
              ]}
              onSelect={(val) =>
                setMaterialFormData({ ...materialFormData, uom: val })
              }
            />
          </FormField>
        </FormModal>

        {/* Part Master Modal */}
        <FormModal
          visible={showPartModal}
          title={editId ? "Edit Part" : "Add New Part"}
          onClose={() => {
            setShowPartModal(false);
            setPartFormData({});
            setEditId(null);
          }}
          onSave={handleSavePart}
          saveLabel={editId ? "Update" : "Save Part"}
        >
          <FormField label="Part ID" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. PART001"
              value={partFormData.partId}
              onChangeText={(t) =>
                setPartFormData({ ...partFormData, partId: t })
              }
            />
          </FormField>
          <FormField label="Part Name" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. Front Plate"
              value={partFormData.partName}
              onChangeText={(t) =>
                setPartFormData({ ...partFormData, partName: t })
              }
            />
          </FormField>
          <FormField label="Material" required>
            <Select
              placeholder="Select Material"
              value={partFormData.materialId}
              options={materials.map((m) => ({
                label: `${m.materialId} | ${m.materialName}`,
                value: m.materialId,
              }))}
              onSelect={(val) =>
                setPartFormData({ ...partFormData, materialId: val })
              }
            />
          </FormField>
          <FormField label="Weight Per Part (KG)" required>
            <TextInput
              style={inputStyle.input}
              keyboardType="numeric"
              placeholder="0.000"
              value={
                partFormData.weightPerPartKg !== undefined &&
                partFormData.weightPerPartKg !== null
                  ? String(partFormData.weightPerPartKg)
                  : ""
              }
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9.]/g, "");
                if (cleaned.split(".").length > 2) return; // Prevent multiple dots
                if (cleaned.includes(".")) {
                  const [int, dec] = cleaned.split(".");
                  if (dec && dec.length > 3) return; // 3 decimals for KG
                }
                setPartFormData((prev) => ({
                  ...prev,
                  weightPerPartKg: cleaned as any,
                }));
              }}
            />
          </FormField>
          <FormField label="Buffer % (Extra Material)">
            <TextInput
              style={inputStyle.input}
              keyboardType="numeric"
              placeholder="e.g. 5 for 5%"
              value={
                partFormData.bufferPercent !== undefined &&
                partFormData.bufferPercent !== null
                  ? String(partFormData.bufferPercent)
                  : ""
              }
              onChangeText={(t) => {
                const cleaned = t.replace(/[^0-9.]/g, "");
                if (cleaned.split(".").length > 2) return; // Prevent multiple dots

                const val = parseFloat(cleaned);
                if (val > 100) return; // Capped at 100%

                // Limit to 2 decimal places
                if (cleaned.includes(".")) {
                  const [int, dec] = cleaned.split(".");
                  if (dec && dec.length > 2) return;
                }
                setPartFormData((prev) => ({
                  ...prev,
                  bufferPercent: cleaned,
                }));
              }}
            />
          </FormField>
        </FormModal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#edf5f4",
  },
  maxWidth: {
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#d7e6e4",
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#00877f",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5b7773",
  },
  tabTextActive: {
    color: "#00877f",
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  actionBtnDelete: {
    backgroundColor: "#ef4444", // Solid red for better visibility
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnDeleteText: {
    fontSize: 12,
    color: "#ffffff", // White text on red background
    fontWeight: "800",
  },
  actionBtnEdit: {
    backgroundColor: "#e8f8f6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnEditText: {
    fontSize: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  rolePickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dropdownList: {
    marginTop: 4,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e6e4",
    boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.1)",
    elevation: 4,
    zIndex: 1000,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#edf5f4",
  },
  dropdownItemActive: {
    backgroundColor: "#e8f8f6",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#486966",
  },
  dropdownItemTextActive: {
    color: "#00877f",
    fontWeight: "700",
  },
  dropdownEmptyText: {
    padding: 12,
    color: "#7a9692",
    fontSize: 13,
    fontWeight: "600",
  },
  passwordField: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 74,
  },
  passwordToggle: {
    position: "absolute",
    right: 8,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e8f8f6",
    borderWidth: 1,
    borderColor: "#a9e4df",
    alignItems: "center",
    justifyContent: "center",
  },
  passwordToggleText: {
    color: "#00877f",
    fontSize: 12,
    fontWeight: "800",
  },
  helperText: {
    color: "#5b7773",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
  },
  configSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d7e6e4",
  },
  configHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  configIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  configTitle: { fontSize: 15, fontWeight: "800", color: "#083d3a" },
  configSubtitle: { fontSize: 12, color: "#5b7773", marginTop: 2 },
  configRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 12,
  },
  toggleBase: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#d7e6e4",
    padding: 2,
  },
  toggleActive: { backgroundColor: "#00877f" },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  toggleThumbActive: { transform: [{ translateX: 18 }] },
  depSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f7fbfa",
    borderRadius: 8,
  },
  countBadge: {
    backgroundColor: "#00877f",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  addValBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#00877f",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnConfig: {
    backgroundColor: "#edf5f4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnConfigText: { fontSize: 12, color: "#00877f", fontWeight: "700" },
  actionBtnPublish: {
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnPublishText: { fontSize: 12, color: "#047857", fontWeight: "700" },
  valueChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d7e6e4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
  },
  valueChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#183f3c",
  },
  valueChipClose: {
    fontSize: 14,
    color: "#5b7773",
    fontWeight: "800",
  },
  checkboxGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  checkboxOption: {
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c8dbd8",
    backgroundColor: "#f7fbfa",
  },
  checkboxOptionActive: {
    borderColor: "#00877f",
    backgroundColor: "#e8f8f6",
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#7a9692",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxBoxActive: {
    borderColor: "#00877f",
    backgroundColor: "#00877f",
  },
  checkboxTick: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#486966",
  },
  checkboxLabelActive: {
    color: "#00877f",
  },
  dangerZone: {
    marginTop: 24,
    padding: 20,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 16,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#991b1b",
    marginBottom: 4,
  },
  dangerText: {
    fontSize: 13,
    color: "#7f1d1d",
    marginBottom: 16,
  },
  btnDanger: {
    backgroundColor: "#dc2626",
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDangerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  kebabBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#edf5f4",
    alignItems: "center",
    justifyContent: "center",
  },
  kebabBtnText: {
    fontSize: 18,
    color: "#486966",
    fontWeight: "700",
    lineHeight: 20,
  },
  kebabMenu: {
    position: "absolute",
    top: 36,
    left: 0,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d7e6e4",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 999,
    minWidth: 110,
    overflow: "hidden",
  },
  kebabMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  kebabMenuItemEditText: {
    fontSize: 13,
    color: "#00877f",
    fontWeight: "600",
  },
  kebabMenuItemDeleteText: {
    fontSize: 13,
    color: "#ef4444",
    fontWeight: "600",
  },
  processEditBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#d7e6e4",
  },
  processEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#00877f",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  processEditBtnIcon: {
    fontSize: 15,
    color: "#ffffff",
    fontWeight: "700",
  },
  processEditBtnText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "700",
  },
});
