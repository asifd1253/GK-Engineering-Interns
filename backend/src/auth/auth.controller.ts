import { Body, Controller, Post, Get, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.email, signInDto.password);
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const token = authHeader.split(' ')[1];
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (!payload?.sub) throw new UnauthorizedException();
      return this.authService.getMe(String(payload.sub), payload.tenantId);
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
