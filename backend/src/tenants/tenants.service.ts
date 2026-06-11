import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './schemas/tenant.schema';
import { Machine } from '../production/schemas/machine.schema';
import { Device } from '../iot/schemas/device.schema';
import { UsersService } from '../users/users.service';
import { Department } from '../users/schemas/user.schema';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private tenantModel: Model<Tenant>,
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
    @InjectModel(Device.name) private deviceModel: Model<Device>,
    private usersService: UsersService,
  ) { }

  async create(createTenantDto: any): Promise<Tenant> {
    const createdTenant = new this.tenantModel({
      domain: createTenantDto.domain,
      tenantName: createTenantDto.tenantName,
      adminEmail: createTenantDto.adminEmail,
      plantId: createTenantDto.plantId || `PLANT${Math.floor(100 + Math.random() * 900)}`,
      parentKey: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    });
    // Explicitly set tenantId to a reserved string so the tenant plugin doesn't complain
    (createdTenant as any).tenantId = 'SYSTEM';
    const saved = await createdTenant.save();

    const newTenantId = saved._id.toString();

    // Now spawn the physical Admin User into MongoDB assigned directly to this Tenant ID
    await this.usersService.create({
      name: `${createTenantDto.tenantName} Admin`,
      email: createTenantDto.adminEmail,
      password: createTenantDto.adminPassword,
      role: 'tenant_admin',
      department: Department.NONE,
      tenantId: newTenantId,
    });

    // Clone all system roles into the new tenant so they have their own editable copies
    await this.usersService.cloneSystemRolesForTenant(newTenantId);

    // Initial Machine Provisioning (Removed - now handled dynamically by Tenant Admins)
    const dcNames = Array.isArray(createTenantDto.dcNames) ? createTenantDto.dcNames.filter((n: string) => n.trim()) : [];
    const macNames = Array.isArray(createTenantDto.macNames) ? createTenantDto.macNames.filter((n: string) => n.trim()) : [];

    // The logic below is removed to allow dynamic provisioning in Configuration
    /*
    const suffix = newTenantId.slice(-4).toUpperCase();
    for (let i = 0; i < dcNames.length; i++) { ... }
    for (let i = 0; i < macNames.length; i++) { ... }
    */

    return saved;
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantModel.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).setOptions({ bypassTenant: true }).exec();
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantModel.findById(id).setOptions({ bypassTenant: true }).exec();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, updateData: any): Promise<Tenant | null> {
    return this.tenantModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .setOptions({ bypassTenant: true })
      .exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.tenantModel
      .findByIdAndUpdate(id, { isActive: false })
      .setOptions({ bypassTenant: true })
      .exec();

    if (result) {
      await this.usersService.deactivateUsersByTenant(id);
    }

    return !!result;
  }

  async getMachinesByTenant(tenantId: string): Promise<any[]> {
    // Fetch from both Machines and Devices (Gateways)
    const [machines, devices] = await Promise.all([
      this.machineModel.find({ tenantId }).setOptions({ bypassTenant: true }).sort({ machineId: 1 }).exec(),
      this.deviceModel.find({ tenantId }).setOptions({ bypassTenant: true }).sort({ gatewayId: 1 }).exec(),
    ]);

    // Unify the list, mapping devices to machine format
    const mappedDevices = devices.map(d => ({
      _id: d._id,
      machineId: (d as any).gatewayId,
      name: (d as any).gatewayName,
      type: (d as any).machineType || 'IOT_GATEWAY',
      status: 'ACTIVE', // Default status for devices
      isIotDevice: true
    }));

    return [...machines, ...mappedDevices];
  }
}
