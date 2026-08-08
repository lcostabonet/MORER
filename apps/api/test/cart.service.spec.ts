import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CartService } from '../src/cart/cart.service';
import type { PrismaService } from '../src/database/prisma.service';

// Phase 11G-alpha: the cart is derived from the httpOnly session cookie. The cart
// API scopes lookups to the given sessionId, so one session can never read
// another session's cart. This confirms that scoping (the API is unchanged).

type CartMock = {
  cart: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function makeMock(): CartMock {
  return {
    cart: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

const ACTIVE_CART = {
  id: 'cart-1',
  sessionId: 'sess-A',
  status: 'ACTIVE',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  items: [],
};

describe('CartService.findBySessionId — session scoping (11G-alpha)', () => {
  let mock: CartMock;
  let service: CartService;

  beforeEach(() => {
    mock = makeMock();
    service = new CartService(mock as unknown as PrismaService);
  });

  it('reads the ACTIVE cart scoped to the given sessionId', async () => {
    mock.cart.findFirst.mockResolvedValue(ACTIVE_CART);
    const res = await service.findBySessionId('sess-A');
    expect(res.id).toBe('cart-1');

    const where = mock.cart.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.sessionId).toBe('sess-A');
    expect(where.status).toBe('ACTIVE');
  });

  it('never returns another session\'s cart — a different sessionId yields 404', async () => {
    mock.cart.findFirst.mockResolvedValue(null); // no ACTIVE cart for this session
    await expect(service.findBySessionId('sess-B')).rejects.toThrow(NotFoundException);

    const where = mock.cart.findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.sessionId).toBe('sess-B');
  });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('CartService.create — server-generated session id (11G-beta)', () => {
  let mock: CartMock;
  let service: CartService;

  beforeEach(() => {
    mock = makeMock();
    // Echo the sessionId the service chose so we can assert it.
    mock.cart.create.mockImplementation((args: { data: { sessionId: string } }) => ({
      id: 'cart-new',
      sessionId: args.data.sessionId,
      status: 'ACTIVE',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      items: [],
    }));
    service = new CartService(mock as unknown as PrismaService);
  });

  it('generates a UUID sessionId itself (never read from any input)', async () => {
    const res = await service.create();
    const data = mock.cart.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.sessionId).toMatch(UUID_RE);
    expect(data.status).toBe('ACTIVE');
    // The service takes NO argument — there is no channel for a caller id.
    expect(CartService.prototype.create.length).toBe(0);
    // The generated id is returned (server-to-server) for the BFF to store.
    expect(res.sessionId).toBe(data.sessionId);
    // No find-or-create by a supplied session id.
    expect(mock.cart.findFirst).not.toHaveBeenCalled();
  });

  it('generates a DISTINCT sessionId on each creation (no fixation/sharing)', async () => {
    await service.create();
    await service.create();
    const a = mock.cart.create.mock.calls[0][0].data.sessionId as string;
    const b = mock.cart.create.mock.calls[1][0].data.sessionId as string;
    expect(a).toMatch(UUID_RE);
    expect(b).toMatch(UUID_RE);
    expect(a).not.toBe(b);
  });
});
