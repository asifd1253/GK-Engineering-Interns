import { Controller, Get, Param, Headers, Res } from '@nestjs/common';
import { IotService } from './iot.service';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class DeviceApiController {
  constructor(private readonly iotService: IotService) {}

  // GET /certs/:filename — requires Authorization: Bearer <device parentKey>
  @Get('certs/:filename')
  async downloadCertFile(
    @Param('filename') filename: string,
    @Headers('authorization') authorization: string,
    @Res() res: Response,
  ) {
    await this.iotService.validateAuthToken(authorization);
    const allowedFiles = new Set(['rootCA.pem', 'server.crt', 'server.key']);
    if (!allowedFiles.has(filename)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = path.join(__dirname, '..', '..', 'certs', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    return res.download(filePath, filename);
  }

  // GET /<custId>/<plantId>/<gatewayId>/updateConfigInfo
  @Get(':custId/:plantId/:gatewayId/updateConfigInfo')
  getUpdateConfigInfo(
    @Param('custId') custId: string,
    @Param('plantId') plantId: string,
    @Param('gatewayId') gatewayId: string,
    @Headers('authorization') authorization: string,
  ) {
    return this.iotService.getDeviceUpdateConfigInfo(custId, plantId, gatewayId, authorization);
  }

  // GET /uploads/ota/:tenantId/:filename — requires Authorization
  @Get('uploads/ota/:tenantId/:filename')
  async downloadOtaFile(
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
}
