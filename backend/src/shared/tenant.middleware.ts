import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenant.context';
import { UsersService } from '../users/users.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private usersService: UsersService) {}
  
  async use(req: Request, res: Response, next: NextFunction) {
    let tenantId = req.headers['x-tenant-id'] as string;
    let userId: string | null = null;
    
    // Also try to extract from Authorization header JWT if not found in x-tenant-id
    const authHeader = req.headers['authorization'];
    if (!tenantId && authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload && payload.tenantId) {
          tenantId = payload.tenantId;
        }
        if (payload && (payload.id || payload._id)) {
          userId = payload.id || payload._id;
        }
      } catch (e) {
        // ignore errors here, authentication guard will handle invalid tokens
      }
    }

    if (userId) {
      try {
        const user = await this.usersService.findById(userId);
        if (user && user.isActive === false) {
          res.status(401).json({ message: 'User account is deactivated.' });
          return;
        }
      } catch (e) {
        // ignore user lookup error
      }
    }

    if (!tenantId) {
        tenantId = 'default-tenant';
    }

    tenantContext.run(tenantId, () => {
      next();
    });
  }
}
