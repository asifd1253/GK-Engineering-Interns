import { Injectable, ConflictException, OnModuleInit, NotFoundException,BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, Department } from './schemas/user.schema';
import { Role, RolePermissions } from './schemas/role.schema';
import * as bcrypt from 'bcrypt';

// Full permission definitions matching the requirements document and image
// Full permission definitions matching the requirements simplified to "Enabled/Disabled"
const INITIAL_ROLES: Array<{
  name: string;
  label: string;
  description: string;
  department: string;
  permissions: RolePermissions;
}> = [
    {
      name: 'SUPER_ADMIN',
      label: 'System Super Admin',
      description: 'System-level access for client and tenant management.',
      department: 'System',
      permissions: {
        dashboard: false, inventory: false, schedules: false, workorders: false,
        pipeline: false, quality: false, reports: false, analytics: false,
        configuration: false, clients: true
      },
    },
    {
      name: 'TENANT_ADMIN',
      label: 'Company Administrator',
      description: 'Full access to all tenant-level modules.',
      department: 'Management',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: true, reports: true, analytics: true,
        configuration: true, clients: false
      },
    },
    {
      name: 'tenant_admin', // Alias for backward compatibility
      label: 'Company Administrator (Legacy)',
      description: 'Legacy admin role mapping.',
      department: 'Management',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: true, reports: true, analytics: true,
        configuration: true, clients: false
      },
    },
    {
      name: 'inventory_user',
      label: 'Store Manager',
      description: 'Inventory management access.',
      department: 'Store',
      permissions: {
        dashboard: true, inventory: ['view', 'add', 'edit', 'delete'], schedules: false, workorders: false,
        pipeline: false, quality: false, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
    {
      name: 'inventory_qi',
      label: 'Inventory Quality Control',
      description: 'Quality inspection for incoming materials.',
      department: 'Quality/Inventory',
      permissions: {
        dashboard: false, inventory: true, schedules: false, workorders: false,
        pipeline: false, quality: false, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
    {
      name: 'pdc_manager',
      label: 'Production Manager',
      description: 'Overall production management.',
      department: 'Production',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: false, reports: true, analytics: true,
        configuration: false, clients: false
      },
    },
    {
      name: 'pdc_diecasting',
      label: 'PDC - Die Casting',
      description: 'Die Casting production technician.',
      department: 'Production',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: false, reports: true, analytics: true,
        configuration: false, clients: false
      },
    },
    {
      name: 'qi_diecasting',
      label: 'QI - Die Casting',
      description: 'Die Casting quality inspector.',
      department: 'Quality',
      permissions: {
        dashboard: true, inventory: false, schedules: false, workorders: false,
        pipeline: true, quality: true, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
    {
      name: 'pdc_coating',
      label: 'PDC - Coating',
      description: 'Coating production technician.',
      department: 'Production',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: false, reports: true, analytics: true,
        configuration: false, clients: false
      },
    },
    {
      name: 'qi_coating',
      label: 'QI - Coating',
      description: 'Coating quality inspector.',
      department: 'Quality',
      permissions: {
        dashboard: true, inventory: false, schedules: false, workorders: false,
        pipeline: true, quality: true, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
    {
      name: 'pdc_machining',
      label: 'PDC - Machining',
      description: 'Machining production technician.',
      department: 'Production',
      permissions: {
        dashboard: true, inventory: true, schedules: true, workorders: true,
        pipeline: true, quality: false, reports: true, analytics: true,
        configuration: false, clients: false
      },
    },
    {
      name: 'qi_machining',
      label: 'QI - Machining',
      description: 'Machining quality inspector.',
      department: 'Quality',
      permissions: {
        dashboard: true, inventory: false, schedules: false, workorders: false,
        pipeline: true, quality: true, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
    {
      name: 'final_qi',
      label: 'Final Quality Inspector',
      description: 'Final gate quality inspector.',
      department: 'Quality/Final',
      permissions: {
        dashboard: true, inventory: false, schedules: true, workorders: false,
        pipeline: true, quality: true, reports: false, analytics: false,
        configuration: false, clients: false
      },
    },
  ];

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
  ) { }

  async onModuleInit() {
    // Seed / update all defined roles with permissions
    for (const r of INITIAL_ROLES) {
      const exists = await this.roleModel
        .findOne({ name: r.name })
        .setOptions({ bypassTenant: true });

      if (!exists) {
        await new this.roleModel({ ...r, tenantId: 'WIMERA_SYSTEM' }).save();
        console.log(`[RBAC] Seeded role: ${r.name}`);
      } else {
        // Always update permissions, label, description, and department to ensure they match the code
        await this.roleModel
          .findByIdAndUpdate(exists._id, {
            permissions: r.permissions,
            label: r.label,
            description: r.description,
            department: r.department
          })
          .setOptions({ bypassTenant: true });
        console.log(`[RBAC] Synced definition for existing role: ${r.name}`);
      }
    }

    // Seed Super Admin user
    const existingAdmin = await this.userModel
      .findOne({ email: 'admin@wimera.com' })
      .setOptions({ bypassTenant: true });

    if (!existingAdmin) {
      console.log('Seeding initial Wimera SUPER_ADMIN...');
      const hash = await bcrypt.hash('wimera123!', 10);
      const superAdmin = new this.userModel({
        name: 'Wimera SuperAdmin',
        email: 'admin@wimera.com',
        passwordHash: hash,
        role: 'super_admin',
        department: Department.NONE,
        tenantId: 'WIMERA_SYSTEM',
      });
      await superAdmin.save();
      console.log('Seeded WIMERA super admin: admin@wimera.com / pass: wimera123!');
    }
  }

  // ─── User Operations ────────────────────────────────────────────────────────

  async create(createDto: any): Promise<User> {
    const existing = await this.userModel
      .findOne({ email: createDto.email })
      .setOptions({ bypassTenant: true });
    if (existing) throw new ConflictException('Email already exists');

    const hash = await bcrypt.hash(createDto.password, 10);
    const createdUser = new this.userModel({
      ...createDto,
      passwordHash: hash,
      customPermissions: createDto.customPermissions || null,
    });
    return createdUser.save();
  }

  async delete(id: string): Promise<any> {
    console.log(`[UsersService] Attempting to delete user ID: ${id}`);
    const result = await this.userModel
      .findByIdAndDelete(id)
      .setOptions({ bypassTenant: true })
      .exec();
    console.log(`[UsersService] Delete result:`, result ? 'Success' : 'User not found');
    return result;
  }

  async update(id: string, updateDto: any): Promise<User | null> {
    if (updateDto.password) {
      updateDto.passwordHash = await bcrypt.hash(updateDto.password, 10);
      delete updateDto.password;
    }
    return this.userModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).setOptions({ bypassTenant: true });
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).setOptions({ bypassTenant: true }).exec();
  }

  async deactivateUsersByTenant(tenantId: string): Promise<void> {
    await this.userModel.updateMany(
      { tenantId },
      { $set: { isActive: false } }
    ).setOptions({ bypassTenant: true }).exec();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find({}, '-passwordHash').sort({ createdAt: -1 }).exec();
  }

  async cloneSystemRolesForTenant(tenantId: string): Promise<void> {
    const systemRoles = await this.roleModel
      .find({ tenantId: 'WIMERA_SYSTEM' })
      .setOptions({ bypassTenant: true })
      .exec();

    for (const sr of systemRoles) {
      // Check if it already exists to prevent duplicates
      const exists = await this.roleModel
        .findOne({ name: sr.name, tenantId })
        .setOptions({ bypassTenant: true })
        .exec();

      if (!exists) {
        const clonedRole = new this.roleModel({
          name: sr.name,
          label: sr.label,
          description: sr.description,
          department: sr.department,
          permissions: sr.permissions,
          tenantId,
        });
        await clonedRole.save();
      }
    }
  }

  // ─── Role Operations ─────────────────────────────────────────────────────────

  async findAllRoles(): Promise<Role[]> {
    const tenantContext = require('../shared/tenant.context').tenantContext;
    const currentTenantId = tenantContext.getStore();
    
    // If not super admin/system context, only show system roles + tenant's own roles
    console.log(`[findAllRoles] currentTenantId = ${currentTenantId}`);
    if (currentTenantId && currentTenantId !== 'WIMERA_SYSTEM') {
      let tenantRoles = await this.roleModel.find({ tenantId: currentTenantId }).setOptions({ bypassTenant: true }).exec();
      console.log(`[findAllRoles] tenantRoles count = ${tenantRoles.length}`);
      
      // Auto-clone roles for existing tenants if they have none
      if (tenantRoles.length === 0) {
        await this.cloneSystemRolesForTenant(currentTenantId);
        // Re-fetch after cloning
        tenantRoles = await this.roleModel.find({ tenantId: currentTenantId }).setOptions({ bypassTenant: true }).exec();
      }

      // Return ONLY the tenant's roles so the UI is clean and they can edit everything
      return tenantRoles;
    }
    
    // Fallback for system context or if no tenant context exists
    return this.roleModel.find().setOptions({ bypassTenant: true }).exec();
  }

  async findRoleByName(name: string, tenantId?: string): Promise<Role | null> {
    const tenantContext = require('../shared/tenant.context').tenantContext;
    const resolvedTenantId = tenantId || tenantContext.getStore();

    if (resolvedTenantId && resolvedTenantId !== 'WIMERA_SYSTEM') {
      const role = await this.roleModel.findOne({ name, tenantId: resolvedTenantId }).setOptions({ bypassTenant: true }).exec();
      if (role) return role;
    }

    // Fallback to system role
    return this.roleModel.findOne({ name, tenantId: 'WIMERA_SYSTEM' }).setOptions({ bypassTenant: true }).exec();
  }

  async createRole(roleDto: any): Promise<Role> {
    const existing = await this.roleModel.findOne({ name: roleDto.name }).exec();
    if (existing) throw new BadRequestException(`Role with name ${roleDto.name} already exists in this tenant.`);
    const role = new this.roleModel(roleDto);
    return role.save();
  }

  async updateRole(id: string, updateDto: any): Promise<Role | null> {
    const tenantContext = require('../shared/tenant.context').tenantContext;
    const currentTenantId = tenantContext.getStore();
    
    if (currentTenantId && currentTenantId !== 'WIMERA_SYSTEM') {
      // Regular tenants can only update their own roles
      return this.roleModel
        .findOneAndUpdate({ _id: id, tenantId: currentTenantId }, updateDto, { new: true })
        .setOptions({ bypassTenant: true })
        .exec();
    }
    return this.roleModel.findByIdAndUpdate(id, updateDto, { new: true }).setOptions({ bypassTenant: true }).exec();
  }

  async deleteRole(id: string): Promise<any> {
    const tenantContext = require('../shared/tenant.context').tenantContext;
    const currentTenantId = tenantContext.getStore();
    
    if (currentTenantId && currentTenantId !== 'WIMERA_SYSTEM') {
      // Regular tenants can only delete their own roles
      return this.roleModel
        .findOneAndDelete({ _id: id, tenantId: currentTenantId })
        .setOptions({ bypassTenant: true })
        .exec();
    }
    return this.roleModel.findByIdAndDelete(id).setOptions({ bypassTenant: true }).exec();
  }
}
