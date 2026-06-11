import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { JwtService } from '@nestjs/jwt';
import { RolePermissions } from '../users/schemas/role.schema';
import { SYSTEM_MODULES } from '../users/permission-defs.service';
import * as bcrypt from 'bcrypt';

// Super admin has access to only client management
const SUPER_ADMIN_PERMISSIONS: RolePermissions = {
  dashboard: false,
  inventory: false,
  schedules: false,
  workorders: false,
  pipeline: false,
  quality: false,
  reports: false,
  analytics: false,
  configuration: false,
  clients: true,
};

const MODULE_ACTIONS = SYSTEM_MODULES.reduce((acc, mod) => {
  acc[mod.key] = mod.actions;
  return acc;
}, {} as Record<string, string[]>);

const MODULE_KEYS = SYSTEM_MODULES.map(mod => mod.key);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private jwtService: JwtService
  ) {}

  async getMe(userId: string, tenantId: string): Promise<any> {
    const user = await this.usersService.findById(userId);
    if (!user || user.isActive === false) throw new UnauthorizedException();

    let permissions: RolePermissions = {
      dashboard: false, inventory: false, schedules: false, workorders: false,
      pipeline: false, quality: false, reports: false, analytics: false,
      configuration: false, clients: false
    };

    if (user.role === 'super_admin' || user.role === 'SUPER_ADMIN') {
      permissions = { dashboard: false, inventory: false, schedules: false, workorders: false, pipeline: false, quality: false, reports: false, analytics: false, configuration: false, clients: true };
    } else if (user.customPermissions && this.hasAnyPermission(user.customPermissions)) {
      permissions = this.normalizePermissions(user.customPermissions);
    } else {
      const roleDoc = await this.usersService.findRoleByName(user.role, tenantId);
      if (roleDoc?.permissions) {
        permissions = this.normalizePermissions(roleDoc.permissions);
      }
    }

    let tenantName = 'Wimera Systems';
    if (tenantId && tenantId !== 'WIMERA_SYSTEM') {
      try {
        const tenant = await this.tenantsService.findOne(tenantId);
        if (tenant) tenantName = tenant.tenantName;
      } catch (e) {}
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName,
      department: user.department,
      process: user.process,
      permissions,
    };
  }

  async signIn(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    console.log('Login attempt:', email, user ? 'Found User' : 'Not found');
    if (!user) throw new UnauthorizedException();

    if (user.isActive === false) {
      throw new UnauthorizedException('User account is deactivated.');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) throw new UnauthorizedException();

    // Resolve permissions: super_admin uses hardcoded permissions, others from DB role
    let permissions: RolePermissions = {
      dashboard: false, inventory: false, schedules: false, workorders: false,
      pipeline: false, quality: false, reports: false, analytics: false,
      configuration: false, clients: false
    };

    if (user.role === 'super_admin' || user.role === 'SUPER_ADMIN') {
      permissions = SUPER_ADMIN_PERMISSIONS;
    } else if (user.customPermissions && this.hasAnyPermission(user.customPermissions)) {
      permissions = this.normalizePermissions(user.customPermissions);
    } else {
      const roleDoc = await this.usersService.findRoleByName(user.role, user.tenantId);
      if (roleDoc?.permissions) {
        permissions = this.normalizePermissions(roleDoc.permissions);
      }
    }

    // Resolve tenant info
    let tenantName = 'Wimera Systems';
    let plantId = 'PLANT001';
    let parentKey = 'd62bf63dcd169919f05f16a619f3818f';

    if (user.tenantId && user.tenantId !== 'WIMERA_SYSTEM') {
      try {
        const tenant = await this.tenantsService.findOne(user.tenantId);
        if (tenant) {
          tenantName = tenant.tenantName;
          plantId = (tenant as any).plantId || 'PLANT001';
          parentKey = (tenant as any).parentKey || 'd62bf63dcd169919f05f16a619f3818f';
        }
      } catch (e) {
        console.error(`Error fetching tenant [ID: ${user.tenantId}]:`, (e as any)?.message || e);
      }
    }

    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      department: user.department,
      permissions,
      plantId,
      parentKey,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenantName,
        department: user.department,
        process: user.process,
        permissions,
        plantId,
        parentKey,
      },
    };
  }

  private hasAnyPermission(perms: any): boolean {
    if (!perms || typeof perms !== 'object') return false;
    return Object.values(perms).some((v: any) =>
      Array.isArray(v) ? v.length > 0 : !!v
    );
  }

  private normalizeModulePermission(module: string, val: any): boolean | string[] {
    if (Array.isArray(val)) return Array.from(new Set(val.filter(Boolean)));
    if (val === true) return MODULE_ACTIONS[module] ? [...MODULE_ACTIONS[module]] : true;
    return false;
  }

  private normalizePermissions(raw: any): RolePermissions {
    const normalized: any = {};
    for (const mod of MODULE_KEYS) {
      normalized[mod] = this.normalizeModulePermission(mod, raw?.[mod]);
    }
    return normalized as RolePermissions;
  }

}
