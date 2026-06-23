import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { createHttpContext } from './helpers/execution-context-mock';

// ─── Phase 9D-beta: rate limiting unit ───────────────────────────────────────
//
// The unit responsible for rate limiting the order-lookup endpoint is the
// standard NestJS `ThrottlerGuard`, wired in AppModule as:
//
//     ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])
//
// and applied via `@UseGuards(ThrottlerGuard)` on `POST checkout/orders/lookup`.
//
// These tests exercise THAT wiring (our ttl/limit) plus the security property
// that the throttle key never exposes the email. There is NO real clock wait:
// time is faked with vi.useFakeTimers(). There is NO Redis — the in-memory
// ThrottlerStorageService is used directly.

const TTL = 60_000;
const LIMIT = 5;

async function buildGuard(): Promise<{
  guard: ThrottlerGuard;
  storage: ThrottlerStorageService;
}> {
  const storage = new ThrottlerStorageService();
  const guard = new ThrottlerGuard(
    [{ ttl: TTL, limit: LIMIT }],
    storage,
    new Reflector(),
  );
  // Populates guard.throttlers from the options array (same as Nest lifecycle).
  await guard.onModuleInit();
  return { guard, storage };
}

describe('ThrottlerGuard (order lookup rate limit)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fixed, deterministic base time — no real clock dependency.
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('within the limit', () => {
    it('accepts requests up to the configured limit', async () => {
      const { guard, storage } = await buildGuard();
      const { context } = createHttpContext({ ip: '203.0.113.1' });

      for (let i = 1; i <= LIMIT; i++) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }

      storage.onApplicationShutdown();
    });
  });

  describe('over the limit', () => {
    it('blocks the request that exceeds the limit', async () => {
      const { guard, storage } = await buildGuard();
      const { context } = createHttpContext({ ip: '203.0.113.2' });

      for (let i = 1; i <= LIMIT; i++) {
        await guard.canActivate(context);
      }

      // The (LIMIT + 1)-th request is rejected.
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ThrottlerException,
      );

      storage.onApplicationShutdown();
    });

    it('allows requests again after the ttl window elapses (faked clock)', async () => {
      const { guard, storage } = await buildGuard();
      const { context } = createHttpContext({ ip: '203.0.113.3' });

      for (let i = 1; i <= LIMIT; i++) {
        await guard.canActivate(context);
      }
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ThrottlerException,
      );

      // Advance past the ttl + block window without any real wait.
      await vi.advanceTimersByTimeAsync(TTL + 1);

      await expect(guard.canActivate(context)).resolves.toBe(true);

      storage.onApplicationShutdown();
    });
  });

  describe('isolation between callers and endpoints', () => {
    it('tracks each client IP independently', async () => {
      const { guard, storage } = await buildGuard();
      const exhausted = createHttpContext({ ip: '203.0.113.4' });
      const fresh = createHttpContext({ ip: '203.0.113.5' });

      for (let i = 1; i <= LIMIT; i++) {
        await guard.canActivate(exhausted.context);
      }
      await expect(guard.canActivate(exhausted.context)).rejects.toBeInstanceOf(
        ThrottlerException,
      );

      // A different IP has its own bucket and is unaffected.
      await expect(guard.canActivate(fresh.context)).resolves.toBe(true);

      storage.onApplicationShutdown();
    });

    it('does not let the lookup limit affect an unrelated endpoint', async () => {
      const { guard, storage } = await buildGuard();
      const ip = '203.0.113.6';
      const lookup = createHttpContext({
        ip,
        className: 'CheckoutController',
        handlerName: 'lookupOrder',
      });
      const other = createHttpContext({
        ip,
        className: 'ProductsController',
        handlerName: 'list',
      });

      // Exhaust the lookup endpoint for this IP.
      for (let i = 1; i <= LIMIT; i++) {
        await guard.canActivate(lookup.context);
      }
      await expect(guard.canActivate(lookup.context)).rejects.toBeInstanceOf(
        ThrottlerException,
      );

      // Same IP, different endpoint → distinct key → not throttled.
      await expect(guard.canActivate(other.context)).resolves.toBe(true);

      storage.onApplicationShutdown();
    });
  });

  describe('the rate-limit key does not expose the email', () => {
    it('tracks by client IP, not by request body', async () => {
      const { guard } = await buildGuard();
      // getTracker is protected; access it the same way the guard calls it.
      const tracker = await (
        guard as unknown as {
          getTracker: (req: Record<string, unknown>) => Promise<string>;
        }
      ).getTracker({
        ip: '203.0.113.7',
        body: { email: 'secret@example.com' },
      });

      expect(tracker).toBe('203.0.113.7');
      expect(tracker).not.toContain('secret@example.com');
    });

    it('never embeds the email in the storage key (it is an IP-based sha256 hash)', async () => {
      const { guard, storage } = await buildGuard();
      const incrementSpy = vi.spyOn(storage, 'increment');
      const { context } = createHttpContext({
        ip: '203.0.113.8',
        body: { email: 'secret@example.com' },
      });

      await guard.canActivate(context);

      expect(incrementSpy).toHaveBeenCalledTimes(1);
      const key = incrementSpy.mock.calls[0][0];
      expect(typeof key).toBe('string');
      expect(key).not.toContain('secret@example.com');
      expect(key).not.toContain('secret');
      // Opaque sha256 digest → 64 hex chars, no PII in clear text.
      expect(key).toMatch(/^[0-9a-f]{64}$/);

      storage.onApplicationShutdown();
    });
  });
});
