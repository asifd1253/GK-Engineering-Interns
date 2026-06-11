import { User, RolePermissions } from '../types';

const FULL_ACTIONS = [
  'view',
  'add',
  'edit',
  'delete',
  'approve',
  'reject',
  'start',
  'complete',
  'pause',
  'submit_qi',
  'rework',
  'full',
];

export function can(
  user: User | null | undefined,
  module: keyof RolePermissions,
  action?: string,
): boolean {
  if (!user || !user.permissions) return false;
  const val = user.permissions[module] as any;

  if (Array.isArray(val)) {
    if (!action) return val.length > 0;
    return val.includes(action) || val.includes('full');
  }

  return !!val;
}

export function canView(user: User | null | undefined, module: keyof RolePermissions): boolean {
  return can(user, module);
}

export function getActions(
  user: User | null | undefined,
  module: keyof RolePermissions,
): string[] {
  if (!user || !user.permissions) return [];
  const val = user.permissions[module] as any;
  if (Array.isArray(val)) return val;
  return val ? FULL_ACTIONS : [];
}

export function isSuperAdmin(user: User | null | undefined): boolean {
  const role = user?.role?.toUpperCase();
  return role === 'SUPER_ADMIN';
}

export function isTenantAdmin(user: User | null | undefined): boolean {
  const role = user?.role?.toUpperCase();
  return role === 'TENANT_ADMIN';
}

export function isAdmin(user: User | null | undefined): boolean {
  return isSuperAdmin(user) || isTenantAdmin(user);
}

export function getAnalyticsScope(user: User | null | undefined): string | null {
  if (!can(user, 'analytics')) return null;
  const actions = getActions(user, 'analytics');
  if (actions.includes('dc_only')) return 'die_casting';
  if (actions.includes('coating_only')) return 'coating';
  if (actions.includes('machining_only')) return 'machining';
  return 'all';
}

export function getReportsScope(user: User | null | undefined): string | null {
  if (!can(user, 'reports')) return null;
  const actions = getActions(user, 'reports');
  if (actions.includes('dc_reports')) return 'dc_reports';
  if (actions.includes('coating_reports')) return 'coating_reports';
  if (actions.includes('machining_reports')) return 'machining_reports';
  return 'all_reports';
}
