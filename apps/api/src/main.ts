import * as path from 'path';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { parseTrustProxy } from './common/client-ip';

// Load .env from the monorepo root before any module is initialised.
// __dirname is apps/api/src (ts-node) or apps/api/dist (compiled) — both
// need three levels up to reach the repo root.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Phase 11J (R2) — trust proxy is OFF by default so X-Forwarded-For is never trusted
  // on an untrusted route (rate limiting keys on the socket peer, coarse but not
  // spoofable). In production set TRUST_PROXY to the exact number of trusted hops in
  // front of the API (e.g. 1 for the Railway edge) so Express resolves the real client
  // IP into req.ip/req.ips and the ProxyAwareThrottlerGuard keys per client.
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}

void bootstrap();
