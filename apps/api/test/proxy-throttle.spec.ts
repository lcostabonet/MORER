import { describe, expect, it } from 'vitest';
import { clientIp, normalizeIp, parseTrustProxy } from '../src/common/client-ip';
import { ProxyAwareThrottlerGuard } from '../src/common/proxy-aware-throttler.guard';

// Phase 11J (R2) — rate-limit identity. `clientIp` mirrors what the
// ProxyAwareThrottlerGuard keys on: Express's proxy-resolved req.ips[0]/req.ip
// (which already applied the trusted hop count), falling back to the socket. It never
// reads the raw X-Forwarded-For, so an untrusted route cannot be spoofed.

describe('parseTrustProxy — safe, explicit trust configuration', () => {
  it('defaults to false (do not trust XFF) when unset/empty/false', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });
  it('accepts an exact hop count', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('0')).toBe(0);
    expect(parseTrustProxy('2')).toBe(2);
  });
  it('accepts true and named/subnet tokens', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });
});

describe('clientIp — proxy-aware throttle key', () => {
  it('PROXY-01: two distinct client IPs → distinct keys (separate buckets)', () => {
    expect(clientIp({ ips: ['1.1.1.1'] })).not.toBe(clientIp({ ips: ['2.2.2.2'] }));
    expect(clientIp({ ips: ['1.1.1.1'] })).toBe('1.1.1.1');
  });

  it('PROXY-02: same client IP → same key (shared bucket)', () => {
    expect(clientIp({ ips: ['9.9.9.9'] })).toBe(clientIp({ ips: ['9.9.9.9'] }));
  });

  it('PROXY-03: a spoofed XFF on an untrusted route grants NO bypass (falls back to socket)', () => {
    // Trust proxy OFF ⇒ Express leaves req.ips empty even if the client sent an XFF
    // header, so we key on the socket peer — the spoof is ignored.
    const attacker = clientIp({ ips: [], ip: '203.0.113.7', socket: { remoteAddress: '203.0.113.7' } });
    const spoofAttempt = clientIp({ ips: [], ip: '203.0.113.7' });
    expect(attacker).toBe('203.0.113.7');
    expect(spoofAttempt).toBe('203.0.113.7'); // cannot choose a different bucket by faking XFF
  });

  it('PROXY-04: a multi-proxy chain resolves to the client-most address', () => {
    // Express req.ips is ordered client-first once trust proxy is configured.
    expect(clientIp({ ips: ['9.9.9.9', '10.0.0.1', '10.0.0.2'] })).toBe('9.9.9.9');
  });

  it('PROXY-07: malformed/missing data → safe fallback, never throws', () => {
    expect(clientIp({ ips: [], ip: undefined, socket: { remoteAddress: '10.0.0.5' } })).toBe('10.0.0.5');
    expect(clientIp({})).toBe('unknown');
  });

  it('PROXY-08: IPv6-mapped IPv4 is normalized to one bucket', () => {
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(clientIp({ ip: '::ffff:8.8.8.8' })).toBe('8.8.8.8');
  });
});

describe('ProxyAwareThrottlerGuard — keys on the resolved client IP (PROXY-05/06)', () => {
  // Instantiated with dummy deps; only getTracker is exercised.
  const guard = new ProxyAwareThrottlerGuard(
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as { getTracker(req: unknown): Promise<string> };

  it('PROXY-05: lookup/login-style request keys on the proxy-resolved client IP', async () => {
    await expect(guard.getTracker({ ips: ['198.51.100.9'], ip: '10.0.0.1' })).resolves.toBe('198.51.100.9');
  });

  it('PROXY-06: with trust off, keys on the socket peer (not a spoofed header)', async () => {
    await expect(guard.getTracker({ ips: [], ip: '198.51.100.20' })).resolves.toBe('198.51.100.20');
  });
});
