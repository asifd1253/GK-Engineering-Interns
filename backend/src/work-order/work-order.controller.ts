import { Controller, Get, Post, Body, Patch, Param, Delete, Headers } from '@nestjs/common';
import { WorkOrderService } from './work-order.service';

@Controller('work-order')
export class WorkOrderController {
  constructor(private readonly workOrderService: WorkOrderService) {}

  @Post()
  async create(@Body() createData: any, @Headers('x-tenant-id') tenantId: string) {
    try {
      console.log(`[WorkOrderController] Payload:`, JSON.stringify(createData, null, 2));
      return await this.workOrderService.create({ ...createData, tenantId });
    } catch (e: any) {
      console.error('[WorkOrderController] CREATE ERROR DETAILS:', JSON.stringify(e, null, 2));
      console.error('[WorkOrderController] Message:', e.message);
      if (e.response) console.error('[WorkOrderController] Response:', JSON.stringify(e.response, null, 2));
      throw e;
    }
  }

  @Get()
  async findAll() {
    return this.workOrderService.findAll();
  }

  @Get('completed-parts')
  async getCompletedParts() {
    return this.workOrderService.getCompletedParts();
  }

  @Get('acceptance-points')
  async getAcceptancePoints(@Headers('x-tenant-id') tenantId: string) {
    console.log(`[WorkOrderController] GET acceptance-points for tenant: ${tenantId}`);
    const pts = await this.workOrderService.getAcceptancePoints();
    console.log(`[WorkOrderController] Returning ${pts.length} acceptance points`);
    return pts;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workOrderService.findOne(id);
  }

  @Post('acceptance-points')
  async createAcceptancePoint(@Body() data: any, @Headers('x-tenant-id') tenantId: string) {
    console.log(`[WorkOrderController] POST acceptance-point: "${data.point}" for tenant: ${tenantId}`);
    return this.workOrderService.createAcceptancePoint(data);
  }

  @Delete('acceptance-points/:id')
  async removeAcceptancePoint(@Param('id') id: string) {
    return this.workOrderService.removeAcceptancePoint(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateData: any) {
    return this.workOrderService.update(id, updateData);
  }

  @Get('validate-part/:partId')
  async validatePart(@Param('partId') partId: string) {
    return this.workOrderService.checkPartStatus(partId);
  }

  @Get('validate-machine/:machineId')
  async validateMachine(@Param('machineId') machineId: string) {
    return this.workOrderService.checkMachineOccupancy(machineId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.workOrderService.remove(id);
  }
}
