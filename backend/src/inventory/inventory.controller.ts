import { Controller, Get, Post, Patch, Param, Body, UseInterceptors, UploadedFile, Headers, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('raw-materials')
  async createRawMaterial(@Body() data: any) {
    return this.inventoryService.createRawMaterial(data);
  }

  @Get('raw-materials')
  async getRawMaterials() {
    return this.inventoryService.getRawMaterials();
  }

  @Delete('raw-materials/:id')
  async deleteRawMaterial(@Param('id') id: string) {
    return this.inventoryService.deleteRawMaterial(id);
  }

  @Get('dashboard')
  async getDashboardData() {
    return this.inventoryService.getDashboardData();
  }

  @Get('stock-summary')
  async getStockSummary(@Headers('x-tenant-id') tenantId: string) {
    return this.inventoryService.calculateStockSummary(tenantId);
  }

  @Get('ledger')
  async getLedger(@Headers('x-tenant-id') tenantId: string) {
    return this.inventoryService.getLedgerData(tenantId);
  }

  @Post('raw-materials/:id')
  async updateRawMaterialPost(@Param('id') id: string, @Body() data: any) {
    const finalId = id || data.id || data._id;
    console.log(`[InventoryController] POST update material ID: ${finalId}, status: ${data.status}`);
    return this.inventoryService.updateRawMaterial(finalId, data);
  }

  @Patch('raw-materials/:id')
  async updateRawMaterialPatch(@Param('id') id: string, @Body() data: any) {
    const finalId = id || data.id || data._id;
    console.log(`[InventoryController] PATCH update material ID: ${finalId}, status: ${data.status}`);
    return this.inventoryService.updateRawMaterial(finalId, data);
  }

  @Get('schedules')
  async getSchedules() {
    return this.inventoryService.getMonthlySchedules();
  }

  @Get('sync-all')
  async syncAll(@Headers('x-tenant-id') tenantId: string) {
    return this.inventoryService.rebuildAllStock(tenantId);
  }

  @Post('schedules')
  async createSchedule(@Body() data: any) {
    return this.inventoryService.createMonthlySchedule(data);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string) {
    return this.inventoryService.deleteMonthlySchedule(id);
  }

  @Patch('schedules/:id')
  async updateSchedule(@Param('id') id: string, @Body() data: any) {
    return this.inventoryService.updateMonthlySchedule(id, data);
  }

  @Get('batches')
  async getBatches() {
    return this.inventoryService.getDistinctBatches();
  }

  @Get('material-grades')
  async getGrades() {
    return this.inventoryService.getDistinctGrades();
  }



  @Get('batch/:id')
  async getBatchDetails(@Param('id') id: string) {
    return this.inventoryService.getBatchDetails(id);
  }

  @Get('grade/:grade')
  async getGradeDetails(@Param('grade') grade: string, @Headers('x-tenant-id') tenantId: string) {
    return this.inventoryService.getGradeDetails(grade, tenantId);
  }


  @Post('upload-materials')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMaterials(@UploadedFile() file: any, 
                       @Headers('x-tenant-id') tenantId: string,
                       @Headers('authorization') auth: string) {
    if (!file || !file.buffer) {
      throw new Error('No file uploaded or file buffer is empty');
    }

    let userId = 'SYSTEM';
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
        userId = payload.id || payload._id || 'SYSTEM';
      } catch (e) {}
    }

    try {
      return await this.inventoryService.bulkUploadRawMaterials(file.buffer, tenantId, userId);
    } catch (e) {
      console.error('[InventoryController] Upload error:', e.message);
      // NestJS will handle the thrown error, but we want to make sure it's clear
      return { success: false, message: e.message };
    }
  }

  @Post('upload-schedules')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSchedules(@UploadedFile() file: any, @Headers('x-tenant-id') tenantId: string) {
    if (!file || !file.buffer) {
      throw new Error('No file uploaded or file buffer is empty');
    }
    try {
      return await this.inventoryService.bulkUploadSchedules(file.buffer, tenantId);
    } catch (e) {
      console.error('[InventoryController] Schedule upload error:', e.message);
      return { success: false, message: e.message };
    }
  }
}

