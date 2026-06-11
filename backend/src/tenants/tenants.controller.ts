import { Controller, Get, Post, Body, Param, Patch, Delete } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async create(@Body() createTenantDto: any) {
    return this.tenantsService.create(createTenantDto);
  }

  @Get()
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateTenantDto: any) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.tenantsService.delete(id);
  }

  @Get(':id/machines')
  async getMachines(@Param('id') id: string): Promise<any[]> {
    return this.tenantsService.getMachinesByTenant(id);
  }
}
