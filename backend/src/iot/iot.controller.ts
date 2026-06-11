import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers, UseInterceptors, UploadedFile, Res, Req, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response, Request } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { IotService } from './iot.service';

@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) { }

  /** GET /iot/gateways — IDs active in hourdata */
  @Get('gateways')
  getGateways() {
    return this.iotService.getAvailableGateways();
  }

  @Get('hourdata')
  getHourData(
    @Query('gatewayId') gatewayId: string,
    @Query('date') date: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    return this.iotService.getHourData(gatewayId, date, startTime, endTime);
  }

  @Get('equipment-status')
  getEquipmentStatus(
    @Query('gatewayId') gatewayId: string,
    @Query('date') date: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ) {
    return this.iotService.getEquipmentStatus(gatewayId, date, startTime, endTime);
  }

  @Get('machine-analytics')
  getMachineAnalyticsDashboard(
    @Query('date') date?: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('machineId') machineId?: string,
  ) {
    return this.iotService.getMachineAnalyticsDashboard(date, startTime, endTime, machineId);
  }

  // Devices
  @Get('devices')
  getDevices() {
    return this.iotService.getDevices();
  }
  @Post('devices')
  createDevice(@Body() data: any) {
    return this.iotService.createDevice(data);
  }
  @Patch('devices/:id')
  updateDevice(@Param('id') id: string, @Body() data: any) {
    return this.iotService.updateDevice(id, data);
  }
  @Delete('devices/:id')
  deleteDevice(@Param('id') id: string) {
    return this.iotService.deleteDevice(id);
  }
  @Post('devices/:id/publish-command')
  publishDeviceCommand(@Param('id') id: string, @Body() data: any) {
    return this.iotService.publishGatewayCommand(id, data?.cmd);
  }

  // OTA Config
  @Get('ota')
  getOTAConfigs() {
    return this.iotService.getOTAConfigs();
  }
  @Post('ota')
  createOTAConfig(@Body() data: any) {
    return this.iotService.createOTAConfig(data);
  }
  @Patch('ota/:id')
  updateOTAConfig(@Param('id') id: string, @Body() data: any) {
    return this.iotService.updateOTAConfig(id, data);
  }
  @Delete('ota/:id')
  deleteOTAConfig(@Param('id') id: string) {
    return this.iotService.deleteOTAConfig(id);
  }

  @Post('ota/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req: any, _file, cb) => {
        const tenantId = req.headers['x-tenant-id'] || req.body?.tenantId || 'default';
        const uploadPath = path.join(__dirname, '..', '..', 'uploads', 'ota', String(tenantId));
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
      },
      filename: (_req, file, cb) => {
        cb(null, file.originalname);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!file.originalname.toLowerCase().endsWith('.bin')) {
        return cb(new BadRequestException('Only .bin files are allowed') as any, false);
      }
      cb(null, true);
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  }))
  uploadOTAFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!file) throw new BadRequestException('No .bin file provided');
    if (!body.fileName) throw new BadRequestException('fileName is required');
    if (!body.version) throw new BadRequestException('version is required');
    return this.iotService.uploadOTAFile(file, { fileName: body.fileName, version: body.version, tenantId: tenantId || body.tenantId });
  }

  @Get('uploads/ota/:tenantId/:filename')
  async downloadOtaByPath(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @Headers('authorization') authorization: string,
    @Res() res: Response,
  ) {
    await this.iotService.validateAuthToken(authorization);
    const filePath = path.join(__dirname, '..', '..', 'uploads', 'ota', tenantId, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    res.download(filePath, filename);
  }

  @Get('ota/download/:id')
  async downloadOTAFile(
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('authorization') authorization: string,
  ) {
    await this.iotService.validateAuthToken(authorization);
    const config = await this.iotService.getOTAConfigById(id);
    const relative = config.fileUrl.replace(/^\//, '');
    const filePath = path.join(__dirname, '..', '..', relative);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }
    res.download(filePath, path.basename(filePath));
  }

  // Device Gateways
  @Get('gateways-master')
  getDeviceGateways() {
    return this.iotService.getDeviceGateways();
  }
  @Post('gateways-master')
  createDeviceGateway(@Body() data: any) {
    return this.iotService.createDeviceGateway(data);
  }
  @Patch('gateways-master/:id')
  updateDeviceGateway(@Param('id') id: string, @Body() data: any) {
    return this.iotService.updateDeviceGateway(id, data);
  }
  @Delete('gateways-master/:id')
  deleteDeviceGateway(@Param('id') id: string) {
    return this.iotService.deleteDeviceGateway(id);
  }

  // Specialized Device APIs (CellAI requirements)
  // Matches: https://serverIP/<domine>/<custId>/<plantId>/<gatewayId>/updateConfigInfo
  // We'll use a more standard route but can be aliased if needed
  @Get('config-info/:gatewayId')
  getDeviceConfigInfo(
    @Param('gatewayId') gatewayId: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.iotService.getDeviceConfigInfo(gatewayId, authorization);
  }

  // Matches: https://serverIP/api/k10V1/masterDevicesConfig/<gatewayID>
  @Get('master-config/:gatewayId')
  getMasterDeviceConfig(
    @Param('gatewayId') gatewayId: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.iotService.getMasterDeviceConfig(gatewayId, authorization);
  }

  @Get('masterDevicesConfig/:gatewayId')
  getDeviceData(
    @Param('gatewayId') gatewayId: string,
    @Req() req: Request,
    @Headers('authorization') authorization: string,
  ) {
    const serverBase = `${req.protocol}://${req.get('host')}`;
    return this.iotService.getDeviceDataFormat(gatewayId, serverBase, authorization);
  }
}
