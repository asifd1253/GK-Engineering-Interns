import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  app.enableCors();

  // Base dir: dist/ in production (Docker), src/ in dev — both sit next to uploads/certs
  const baseDir = path.join(__dirname, '..');

  // uploads dir — mount as Docker volume at <baseDir>/uploads for persistence
  const uploadsDir = path.join(baseDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  // certs are served through an authenticated controller route.
  const certsDir = path.join(baseDir, 'certs');
  if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
