import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { User, RawMaterial, MonthlySchedule, WorkOrder, ProcessStage, QualityInspection, DashboardData, Machine, Shift, Role } from '../types';

export const API_BASE_URL = 'http://localhost:3000';
// export const API_BASE_URL = 'https://gkengineering.wimerasys.in/testapi'

const DISPLAY_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function fmtDate(value: any): string {
  if (!value) return '—';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}-${DISPLAY_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function fmtDateTime(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDate(d)} ${hh}:${min}`;
}
// export const API_BASE_URL = 'http://172.27.95.30:3000'
// export const API_BASE_URL = 'http://192.168.1.193:3000' // Updated for mobile connectivity
// export const API_BASE_URL = 'https://gkengineering.wimerasys.in/testapi'

export class DataStorage {
  private static readonly CURRENT_USER_KEY = 'current_user';

  private static isWebSessionStorageAvailable(): boolean {
    return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.sessionStorage;
  }

  private static async getSessionItem(key: string): Promise<string | null> {
    if (this.isWebSessionStorageAvailable()) {
      return window.sessionStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  }

  private static async setSessionItem(key: string, value: string): Promise<void> {
    if (this.isWebSessionStorageAvailable()) {
      window.sessionStorage.setItem(key, value);
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, value);
  }

  private static async removeSessionItem(key: string): Promise<void> {
    if (this.isWebSessionStorageAvailable()) {
      window.sessionStorage.removeItem(key);
    }
    await AsyncStorage.removeItem(key);
  }

  // Add auth token helper
  static async getHeaders(): Promise<any> {
    const userJson = await this.getSessionItem(this.CURRENT_USER_KEY);
    const headers: any = { 'Content-Type': 'application/json' };
    if (userJson) {
      const user = JSON.parse(userJson);
      if (user.token) {
        headers['Authorization'] = `Bearer ${user.token}`;
      }
      if (user.tenantId) {
        headers['x-tenant-id'] = user.tenantId;
      }
    }
    return headers;
  }

  private static async handleResponse(resp: Response, fallbackMsg: string) {
    if (resp.ok) return resp.json();
    let msg = fallbackMsg;
    try {
      const err = await resp.json();
      msg = err.message || fallbackMsg;
    } catch (e) { }
    throw new Error(msg);
  }

  // Users
  static async getUsers(): Promise<User[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) {
        const data = await resp.json();
        // Map _id to id if necessary
        return data.map((u: any) => ({ ...u, id: u._id }));
      }
    } catch (e) { }
    return [];
  }

  static async createUser(userData: any): Promise<User | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(userData)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async updateUser(id: string, userData: any): Promise<User | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'POST', // Backend expects POST /users/:id
        headers: await this.getHeaders(),
        body: JSON.stringify(userData)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteUser(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Roles
  static async getRoles(): Promise<Role[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/roles`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createRole(roleData: any): Promise<Role | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/roles`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(roleData)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteRole(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/roles/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  static async updateRole(id: string, roleData: any): Promise<Role | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/roles/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(roleData)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }



  static async getMe(): Promise<User | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) {
        const fresh = await resp.json();
        const stored = await this.getCurrentUser();
        return { ...fresh, token: stored?.token };
      }
    } catch (e) { }
    return null;
  }

  // Current User (keep in async storage for session)
  static async getCurrentUser(): Promise<User | null> {
    const data = await this.getSessionItem(this.CURRENT_USER_KEY);
    return data ? JSON.parse(data) : null;
  }

  static async setCurrentUser(user: User | null): Promise<void> {
    if (!user) await this.removeSessionItem(this.CURRENT_USER_KEY);
    else await this.setSessionItem(this.CURRENT_USER_KEY, JSON.stringify(user));
  }

  static async logout(): Promise<void> {
    await this.removeSessionItem(this.CURRENT_USER_KEY);
  }

  static async getPermissionDefs(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/users/permission-defs`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  // Raw Materials
  static async getRawMaterials(): Promise<RawMaterial[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/raw-materials`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createRawMaterial(material: any): Promise<RawMaterial | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/raw-materials`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(material)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async saveRawMaterials(materials: RawMaterial[]): Promise<void> {
    // legacy loop, ideally should use updateRawMaterial for existing items
    for (const m of materials) {
      if (m.id || m._id) {
        await this.updateRawMaterial(m.id || m._id || '', m);
      } else {
        await this.createRawMaterial(m);
      }
    }
  }

  static async updateRawMaterial(id: string, data: any): Promise<RawMaterial | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/raw-materials/${id}`, {
        method: 'POST', // Backend controller uses @Post('raw-materials/:id')
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteRawMaterial(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/raw-materials/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { return false; }
  }

  // Monthly Schedules
  static async getMonthlySchedules(): Promise<MonthlySchedule[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/schedules`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createMonthlySchedule(schedule: any): Promise<MonthlySchedule | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/schedules`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(schedule)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteMonthlySchedule(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/schedules/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { return false; }
  }

  static async updateMonthlySchedule(id: string, data: any): Promise<MonthlySchedule | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/schedules/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async getInventoryBatches(): Promise<string[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/batches`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async getInventoryGrades(): Promise<string[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/material-grades`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }



  static async getBatchDetails(materialId: string): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/batch/${materialId}`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) {
        const text = await resp.text();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('[DataStorage] Failed to parse batch details JSON:', text);
          return null;
        }
      }
    } catch (e) {
      console.error('[DataStorage] getBatchDetails error:', e);
    }
    return null;
  }

  static async getStockSummary(): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/stock-summary`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.error('[DataStorage] getStockSummary error:', e);
    }
    return null;
  }

  static async getInventoryLedger(): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/ledger`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) {
      console.error('[DataStorage] getInventoryLedger error:', e);
    }
    return null;
  }

  static async getGradeDetails(grade: string): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/grade/${encodeURIComponent(grade)}`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }


  static async uploadInventoryExcel(file: any): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.getCurrentUser();
      const headers = await this.getHeaders();
      delete headers['Content-Type']; // Let browser set multipart boundary

      const formData = new FormData();
      let fileToUpload: any;
      if (Platform.OS === 'web') {
        fileToUpload = (file as any).file || file;
      } else {
        fileToUpload = {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream'
        } as any;
      }
      formData.append('file', fileToUpload);

      const resp = await fetch(`${API_BASE_URL}/inventory/upload-materials`, {
        method: 'POST',
        headers: {
          ...headers,
          'x-tenant-id': user?.tenantId || '',
        },
        body: formData
      });

      const result = await resp.json();
      if (resp.ok) {
        return { success: true, message: `Successfully imported ${result.count || 0} materials.` };
      }
      return { success: false, message: result.message || 'Server rejected the file. Check your data format.' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Network error during upload.' };
    }
  }

  static async uploadScheduleExcel(file: any): Promise<{ success: boolean; message: string }> {
    try {
      const user = await this.getCurrentUser();
      const headers = await this.getHeaders();
      delete headers['Content-Type']; // Let browser set multipart boundary

      const formData = new FormData();
      let fileToUpload: any;
      if (Platform.OS === 'web') {
        fileToUpload = (file as any).file || file;
      } else {
        fileToUpload = {
          uri: file.uri,
          name: file.name,
          type: file.mimeType || 'application/octet-stream'
        } as any;
      }
      formData.append('file', fileToUpload);

      const resp = await fetch(`${API_BASE_URL}/inventory/upload-schedules`, {
        method: 'POST',
        headers: {
          ...headers,
          'x-tenant-id': user?.tenantId || '',
        },
        body: formData
      });

      const result = await resp.json();
      if (resp.ok) {
        return { success: true, message: `Successfully imported ${result.count || 0} schedule entries.` };
      }
      return { success: false, message: result.message || 'Server rejected the file.' };
    } catch (e: any) {
      return { success: false, message: e.message || 'Network error during upload.' };
    }
  }

  static async getMachines(type?: string): Promise<any[]> {
    try {
      // 1. Fetch native production machines
      let prodMachinesUrl = `${API_BASE_URL}/production/machines`;
      if (type) prodMachinesUrl += `?type=${type}`;

      const prodMachinesResp = await fetch(prodMachinesUrl, { headers: await this.getHeaders() });
      let nativeMachines: any[] = [];
      if (prodMachinesResp.ok) {
        nativeMachines = await prodMachinesResp.json();
      }

      // 2. Fetch legacy IoT mapped devices
      let legacyMapped: any[] = [];
      const [devicesResp, typesResp] = await Promise.all([
        fetch(`${API_BASE_URL}/iot/devices`, { headers: await this.getHeaders() }),
        fetch(`${API_BASE_URL}/production/machine-types`, { headers: await this.getHeaders() })
      ]);

      if (devicesResp.ok && typesResp.ok) {
        const devices = await devicesResp.json();
        const machineTypes = await typesResp.json();

        const typeMap: Record<string, string> = {};
        for (const mt of machineTypes) {
          typeMap[mt.machineType] = mt.processCategory || mt.machineType;
        }

        const allMapped = devices.map((d: any) => ({
          _id: d._id,
          machineId: d.gatewayId,
          name: d.gatewayName,
          type: typeMap[d.machineType] || d.machineType || 'UNKNOWN',
          status: 'ACTIVE'
        }));

        if (type) {
          legacyMapped = allMapped.filter((m: any) => m.type === type);
        } else {
          legacyMapped = allMapped;
        }
      }

      // Combine both, avoiding duplicates by machineId
      const combined = [...nativeMachines];
      const existingIds = new Set(nativeMachines.map(m => m.machineId));

      for (const lm of legacyMapped) {
        if (!existingIds.has(lm.machineId)) {
          combined.push(lm);
          existingIds.add(lm.machineId);
        }
      }

      return combined;
    } catch (e) { console.error('Failed to get combined machines', e); }
    return [];
  }




  static async createMachine(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machines`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create machine');
    } catch (e) {
      console.error('[DataStorage] createMachine error:', e);
      throw e;
    }
  }

  static async updateMachine(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machines/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update machine');
    } catch (e) {
      console.error('[DataStorage] updateMachine error:', e);
      throw e;
    }
  }

  static async deleteMachine(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machines/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Shifts
  static async getShifts(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/shifts`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createShift(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/shifts`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create shift');
    } catch (e) {
      console.error('[DataStorage] createShift error:', e);
      throw e;
    }
  }

  static async updateShift(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/shifts/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update shift');
    } catch (e) {
      console.error('[DataStorage] updateShift error:', e);
      throw e;
    }
  }

  static async deleteShift(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/shifts/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Departments
  static async getDepartments(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/departments`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createDepartment(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/departments`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create department');
    } catch (e) {
      console.error('[DataStorage] createDepartment error:', e);
      throw e;
    }
  }
  static async updateDepartment(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/departments/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update department');
    } catch (e) {
      console.error('[DataStorage] updateDepartment error:', e);
      throw e;
    }
  }
  static async deleteDepartment(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/departments/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Machine Types
  static async getMachineTypes(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machine-types`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createMachineType(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machine-types`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create machine type');
    } catch (e) {
      console.error('[DataStorage] createMachineType error:', e);
      throw e;
    }
  }
  static async updateMachineType(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machine-types/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update machine type');
    } catch (e) {
      console.error('[DataStorage] updateMachineType error:', e);
      throw e;
    }
  }
  static async deleteMachineType(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/machine-types/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Reasons (Master)
  static async getReasons(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/reasons`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createReason(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/reasons`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create reason');
    } catch (e) {
      console.error('[DataStorage] createReason error:', e);
      throw e;
    }
  }
  static async updateReason(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/reasons/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update reason');
    } catch (e) {
      console.error('[DataStorage] updateReason error:', e);
      throw e;
    }
  }
  static async deleteReason(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/reasons/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Processes
  static async getProcesses(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/processes`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createProcess(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/processes`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create process');
    } catch (e) {
      console.error('[DataStorage] createProcess error:', e);
      throw e;
    }
  }
  static async updateProcess(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/processes/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update process');
    } catch (e) {
      console.error('[DataStorage] updateProcess error:', e);
      throw e;
    }
  }
  static async deleteProcess(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/processes/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Program Master
  static async getProgramMasters(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/program-masters`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createProgramMaster(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/program-masters`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create program');
    } catch (e) {
      console.error('[DataStorage] createProgramMaster error:', e);
      throw e;
    }
  }
  static async updateProgramMaster(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/program-masters/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update program');
    } catch (e) {
      console.error('[DataStorage] updateProgramMaster error:', e);
      throw e;
    }
  }
  static async deleteProgramMaster(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/program-masters/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Vendors
  static async getVendors(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/vendors`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createVendor(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/vendors`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create vendor');
    } catch (e) {
      console.error('[DataStorage] createVendor error:', e);
      throw e;
    }
  }
  static async updateVendor(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/vendors/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update vendor');
    } catch (e) {
      console.error('[DataStorage] updateVendor error:', e);
      throw e;
    }
  }
  static async deleteVendor(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/vendors/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Material Master
  static async getMaterials(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/materials`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createMaterial(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/materials`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create material');
    } catch (e) {
      console.error('[DataStorage] createMaterial error:', e);
      throw e;
    }
  }
  static async updateMaterial(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/materials/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update material');
    } catch (e) {
      console.error('[DataStorage] updateMaterial error:', e);
      throw e;
    }
  }
  static async deleteMaterial(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/materials/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Part Master
  static async getParts(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/parts`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createPart(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/parts`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to create part');
    } catch (e) {
      console.error('[DataStorage] createPart error:', e);
      throw e;
    }
  }
  static async updatePart(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/parts/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      return this.handleResponse(resp, 'Failed to update part');
    } catch (e) {
      console.error('[DataStorage] updatePart error:', e);
      throw e;
    }
  }
  static async deletePart(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/parts/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  static async getMachineAnalytics(from?: string, to?: string): Promise<any[]> {
    try {
      let url = `${API_BASE_URL}/production/machine-analytics`;
      if (from && to) {
        url += `?from=${from}&to=${to}`;
      }
      const resp = await fetch(url, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async getIotMachineAnalytics(date: string, startTime?: string, endTime?: string, machineId?: string): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (startTime) params.set('startTime', startTime);
      if (endTime) params.set('endTime', endTime);
      if (machineId) params.set('machineId', machineId);

      const url = `${API_BASE_URL}/iot/machine-analytics${params.toString() ? `?${params.toString()}` : ''}`;
      const resp = await fetch(url, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return { machines: [], shifts: [], hourData: [], statusData: [] };
  }

  static async getNotifications(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/notifications`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  // Acceptance Points
  static async getAcceptancePoints(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/acceptance-points`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createAcceptancePoint(data: { point: string }): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/acceptance-points`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteAcceptancePoint(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/acceptance-points/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Work Orders
  static async getWorkOrders(): Promise<WorkOrder[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async getWorkOrderById(id: string): Promise<WorkOrder | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/${id}`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async getCompletedParts(): Promise<string[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/completed-parts`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async validatePart(partId: string): Promise<{ status: 'AVAILABLE' | 'WIP' | 'COMPLETED', workOrderId?: string }> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/validate-part/${partId}`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return { status: 'AVAILABLE' };
  }

  static async validateMachine(machineId: string): Promise<{ isOccupied: boolean, details?: any }> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/validate-machine/${machineId}`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return { isOccupied: false };
  }


  static async createWorkOrder(order: Partial<WorkOrder>): Promise<{ success: boolean; message: string; data?: WorkOrder }> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(order)
      });
      const result = await resp.json();
      if (resp.ok) return { success: true, message: 'Work Order created successfully', data: result };

      let message = 'Server rejected the request.';
      if (result.message) {
        message = Array.isArray(result.message) ? result.message.join(', ') : result.message;
      }
      return { success: false, message };
    } catch (e: any) {
      return { success: false, message: e.message || 'Network error during creation.' };
    }
  }

  static async updateWorkOrder(id: string, updateData: Partial<WorkOrder>): Promise<WorkOrder | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(updateData)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteWorkOrder(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/work-order/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Process Stages
  static async getProcessStages(type?: string): Promise<ProcessStage[]> {
    try {
      const url = type ? `${API_BASE_URL}/production/stages?type=${type}` : `${API_BASE_URL}/production/stages`;
      const resp = await fetch(url, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async startProcessStage(
    id: string,
    userId: string,
    plannedTiming?: string,
    machineId?: string,
    machineAssignments?: Array<{
      machineId: string;
      qty?: number;
      targetQuantity?: number;
      startDate?: string;
      endDate?: string;
      programId?: string;
      cycleTime?: number;
      totalCycleTimeSeconds?: number;
      partsPerCycle?: number;
      partsType?: string | number;
      selectPartType?: string | number;
      pricePerPart?: number;
      startTime?: number;
      StartTime?: number;
      endTime?: number;
      EndTime?: number;
      status?: string;
      Status?: string;
      shiftId?: string;
      CustId?: string;
      PlantId?: string;
      custId?: string;
      plantId?: string;
    }>,
    extraDetails?: any
  ): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/start`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ userId, plannedTiming, machineId, machineAssignments, extraDetails })
      });
      if (resp.ok) return resp.json();
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any).message || 'Failed to start stage');
    } catch (e) { throw e; }
  }

  static async signalProcessStageQI(id: string, userId: string, note?: string): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/signal-qi`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ userId, note })
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async earlyEndMachineAssignment(id: string, data: {
    userId: string;
    machineId: string;
    productionDate: string;
    shift: string;
    shiftId?: string;
    reason: string;
    endTime?: number;
  }): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/machine-assignments/early-end`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any).message || 'Failed to end previous machine assignment');
    } catch (e) { throw e; }
  }

  static async submitProcessStageQI(id: string, data: any, userId: string): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/submit-qi`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ data, userId })
      });
      if (resp.ok) return resp.json();
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as any).message || 'Failed to submit QI');
    } catch (e) { throw e; }
  }

  static async approveProcessStageQI(id: string, userId: string): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/approve-qi`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ userId })
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async managerRouteStage(id: string, nextType: string | null, isRework: boolean = false): Promise<ProcessStage | null> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/stages/${id}/route`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ nextType, isRework })
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async getQualityReasons(type?: string, category?: string): Promise<any[]> {
    try {
      const url = `${API_BASE_URL}/production/quality-reasons?type=${type || ''}&category=${category || ''}`;
      const resp = await fetch(url, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createQualityReason(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/quality-reasons`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  // Quality Inspections
  static async getQualityInspections(): Promise<QualityInspection[]> {
    try {
      const stages = await this.getProcessStages();
      return stages
        .filter(s => s.status !== 'PENDING' && s.status !== 'IN_PROGRESS') // Must have QI metrics
        .map(s => {
          const wo = s.workOrderId as any;
          const rawShift = wo?.shift || (typeof s.workOrderId === 'string' ? '' : 'N/A');
          const normalizedShift = rawShift.charAt(0).toUpperCase() + rawShift.slice(1).toLowerCase();
          const finalShift = ['Morning', 'Evening', 'Night'].includes(normalizedShift) ? normalizedShift : 'N/A';

          return {
            id: s._id || s.id || Math.random().toString(),
            date: s.updatedAt ? s.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
            masterId: wo?.id || wo?._id || 'N/A',
            partId: wo?.partId || 'Unknown',
            shift: finalShift,
            machine: s.machineId || wo?.machineId || 'N/A',
            producedCount: s.inputQuantity || 0,
            goodCount: s.goodPartsCount || 0,
            reworkCount: s.reworkPartsCount || 0,
            reworkReasons: s.reworkReasons || [],
            rejectedCount: s.rejectedPartsCount || 0,
            rejectionReasons: s.rejectionReasons || [],
            inspectedBy: s.qiUserId?.name || 'System',
            type: s.type === 'FINAL_QA' ? 'final' : 'in_process',
            status: s.status === 'COMPLETED' || s.status === 'PDC_VERIFIED' ? 'approved' : 'pending',
          } as QualityInspection;
        });
    } catch (e) { }
    return [];
  }

  static async saveQualityInspections(inspections: QualityInspection[]): Promise<void> {
    // Quality is now derivative of Production Pipeline
  }

  // Initialize sample data
  static async initializeSampleData(): Promise<void> {
    // Let the backend handle init or just skip.
  }

  // Get dashboard data
  static async getDashboardData(): Promise<DashboardData> {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/dashboard`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }

    return {
      totalRawMaterials: 0,
      totalWorkOrders: 0,
      activeWorkOrders: 0,
      totalInspections: 0,
      totalScrap: 0,
    };
  }

  // Tenants Management
  static async getTenants(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/tenants`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createTenant(tenantData: any): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/tenants`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(tenantData)
      });
    } catch (e) { }
  }

  static async updateTenant(id: string, tenantData: any): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/tenants/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(tenantData)
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  static async deleteTenant(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/tenants/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  static async getTenantMachines(tenantId: string): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/tenants/${tenantId}/machines`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  // IoT Analytics
  static async getIotGateways(): Promise<string[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/gateways`, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  // Devices
  static async getDevices(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/devices`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createDevice(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/devices`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async updateDevice(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/devices/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async deleteDevice(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/devices/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }
  static async publishDeviceCommand(id: string, cmd: string): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/devices/${id}/publish-command`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ cmd })
      });
      const result = await resp.json().catch(() => ({}));
      if (resp.ok) return result;
      throw new Error(result.message || 'Failed to publish command');
    } catch (e: any) {
      throw new Error(e.message || 'Failed to publish command');
    }
  }

  // OTA Config
  static async uploadOTAFile(file: File, fileName: string, version: string): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', fileName);
      formData.append('version', version);
      const baseHeaders = await this.getHeaders();
      const headers: Record<string, string> = {};
      Object.entries(baseHeaders).forEach(([k, v]) => {
        if (k.toLowerCase() !== 'content-type') headers[k] = v as string;
      });
      const resp = await fetch(`${API_BASE_URL}/iot/ota/upload`, { method: 'POST', headers, body: formData });
      if (resp.ok) return resp.json();
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || 'Upload failed');
    } catch (e) { throw e; }
  }

  static async downloadOTAFile(id: string): Promise<void> {
    const a = document.createElement('a');
    a.href = `${API_BASE_URL}/iot/ota/download/${id}`;
    a.setAttribute('download', '');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  static async getOTAConfigs(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/ota`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createOTAConfig(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/ota`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async updateOTAConfig(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/ota/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async deleteOTAConfig(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/ota/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Device Gateways (Master List)
  static async getGatewaysMaster(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/gateways-master`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }
  static async createGatewayMaster(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/gateways-master`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async updateGatewayMaster(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/gateways-master/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }
  static async deleteGatewayMaster(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/iot/gateways-master/${id}`, { method: 'DELETE', headers: await this.getHeaders() });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  static async getIotHourData(gatewayId: string, date: string, startTime?: string, endTime?: string): Promise<any[]> {
    try {
      let url = `${API_BASE_URL}/iot/hourdata?gatewayId=${gatewayId}&date=${date}`;
      if (startTime) url += `&startTime=${encodeURIComponent(startTime)}`;
      if (endTime) url += `&endTime=${encodeURIComponent(endTime)}`;

      const resp = await fetch(url, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async getIotEquipmentStatus(gatewayId: string, date: string, startTime?: string, endTime?: string): Promise<any[]> {
    try {
      let url = `${API_BASE_URL}/iot/equipment-status?gatewayId=${gatewayId}&date=${date}`;
      if (startTime) url += `&startTime=${encodeURIComponent(startTime)}`;
      if (endTime) url += `&endTime=${encodeURIComponent(endTime)}`;

      const resp = await fetch(url, {
        headers: await this.getHeaders()
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  // Operators
  static async getOperators(process?: string): Promise<any[]> {
    try {
      const url = process ? `${API_BASE_URL}/production/operators?process=${process}` : `${API_BASE_URL}/production/operators`;
      const resp = await fetch(url, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async getAllOperators(): Promise<any[]> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/operators/all`, { headers: await this.getHeaders() });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return [];
  }

  static async createOperator(data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/operators`, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async updateOperator(id: string, data: any): Promise<any> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/operators/${id}`, {
        method: 'PATCH',
        headers: await this.getHeaders(),
        body: JSON.stringify(data)
      });
      if (resp.ok) return resp.json();
    } catch (e) { }
    return null;
  }

  static async deleteOperator(id: string): Promise<boolean> {
    try {
      const resp = await fetch(`${API_BASE_URL}/production/operators/${id}`, {
        method: 'DELETE',
        headers: await this.getHeaders()
      });
      return resp.ok;
    } catch (e) { }
    return false;
  }

  // Reset all stored data
  static async resetAllData(): Promise<void> {
    await this.removeSessionItem(this.CURRENT_USER_KEY);
  }


}
