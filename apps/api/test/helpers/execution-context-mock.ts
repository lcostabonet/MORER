import { vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

// ─── ExecutionContext mock for guard tests ───────────────────────────────────
//
// ThrottlerGuard only touches a small slice of ExecutionContext:
//   - getHandler() / getClass()  → used to build the rate-limit key prefix
//   - switchToHttp().getRequest()/getResponse() → req.ip (tracker) and res.header
//
// We model exactly that. No HTTP server, no real request — everything is in
// memory. The handler/class are real (named) functions so `.name` is stable and
// so a real Nest `Reflector` reads `undefined` metadata from them (no overrides).

export type MockRequest = {
  ip: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
};

export type MockResponse = {
  header: ReturnType<typeof vi.fn>;
};

export type HttpContextOptions = {
  ip: string;
  /** Distinct handler/class names yield distinct rate-limit keys (per-endpoint). */
  handlerName?: string;
  className?: string;
  /** Optional request body — used to prove it never leaks into the throttle key. */
  body?: Record<string, unknown>;
};

export type MockHttpContext = {
  context: ExecutionContext;
  req: MockRequest;
  res: MockResponse;
};

function namedFunction(name: string): (...args: unknown[]) => void {
  // Build a function whose `.name` is exactly `name`.
  return { [name]: () => undefined }[name] as (...args: unknown[]) => void;
}

function namedClass(name: string): new () => unknown {
  return { [name]: class {} }[name] as new () => unknown;
}

export function createHttpContext(opts: HttpContextOptions): MockHttpContext {
  const req: MockRequest = {
    ip: opts.ip,
    headers: {},
    body: opts.body,
  };
  const res: MockResponse = {
    header: vi.fn(),
  };

  const handler = namedFunction(opts.handlerName ?? 'lookupOrder');
  const classRef = namedClass(opts.className ?? 'CheckoutController');

  const context = {
    getHandler: () => handler,
    getClass: () => classRef,
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;

  return { context, req, res };
}
