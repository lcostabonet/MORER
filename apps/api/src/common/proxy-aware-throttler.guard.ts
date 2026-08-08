import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from './client-ip';

// Phase 11J (R2) — ThrottlerGuard that keys buckets on the proxy-resolved client IP
// (Express req.ips/req.ip, honoring the configured `trust proxy` hop count) instead of
// the raw socket peer. With trust proxy off (default) it falls back to the socket
// address, so a spoofed X-Forwarded-For never grants a separate bucket.
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as { ips?: string[]; ip?: string; socket?: { remoteAddress?: string } });
  }
}
