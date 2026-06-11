import { Injectable } from '@nestjs/common';

export const SYSTEM_MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view', 'full'] },
  { key: 'analytics', label: 'Analytics', actions: ['view', 'full', 'dc_only', 'coating_only', 'machining_only'] },
  { key: 'inventory', label: 'Inventory', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'schedules', label: 'Schedules', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'workorders', label: 'Work Orders', actions: ['view', 'add', 'edit', 'delete', 'start', 'pause', 'complete', 'approve'] },
  { key: 'pipeline', label: 'Pipeline', actions: ['view', 'add', 'edit'] },
  { key: 'quality', label: 'Quality', actions: ['view', 'submit_qi', 'approve', 'reject', 'rework'] },
  { key: 'reports', label: 'Reports', actions: ['view', 'all_reports', 'dc_reports', 'coating_reports', 'machining_reports'] },
  { key: 'configuration', label: 'Configuration', actions: [
    'view', 'add', 'edit', 'delete', 'full',
    'view_users', 'view_roles', 'view_devices', 'view_shifts',
    'view_ota', 'view_dept', 'view_machine_type', 'view_reasons',
    'view_acceptance_points', 'view_process', 'view_program', 'view_vendor'
  ] },
  { key: 'clients', label: 'Client Mgmt', actions: ['view', 'add', 'edit', 'delete', 'full'] },
];

@Injectable()
export class PermissionDefsService {
  getSystemModules() {
    return SYSTEM_MODULES;
  }
}
