/// <reference types="node" />
/**
 * Phase 11G-beta: the SERVER is the sole authority for a cart's sessionId.
 *
 * POST /cart accepts NO fields — the API generates the sessionId (randomUUID) for
 * every new cart. A caller can never choose it, so even a syntactically valid UUID
 * supplied by the caller is rejected (400). CartService is mocked, so these tests
 * exercise the controller + ValidationPipe contract in isolation. Run against the
 * pre-fix code, the "reject any sessionId" cases FAIL (a valid UUID is still
 * accepted) — that is the remaining-risk reproduction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { default as supertestDefault } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = supertestDefault as unknown as (app: any) => import('supertest').SuperTest<import('supertest').Test>;

const API_SESSION = '99999999-9999-4999-8999-999999999999'; // pretend server-issued id

// CartService is replaced wholesale. create() takes NO args and returns a cart
// whose sessionId was chosen by the "server" (the mock) — never by the caller.
vi.mock('../src/cart/cart.service', () => ({
  CartService: class MockCartService {
    create = vi.fn(() => ({
      id: 'cart-1',
      status: 'ACTIVE',
      items: [],
      subtotalInCents: 0,
      currency: 'EUR',
      sessionId: API_SESSION,
    }));
  },
}));

import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';

async function buildApp(): Promise<{ app: INestApplication; create: ReturnType<typeof vi.fn> }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [CartController],
    providers: [CartService],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const create = (moduleRef.get(CartService) as unknown as { create: ReturnType<typeof vi.fn> }).create;
  return { app, create };
}

describe('POST /cart — server-authoritative session id (11G-beta)', () => {
  let app: INestApplication;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ({ app, create } = await buildApp());
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ── Empty body → the API creates a cart with its OWN sessionId ──────────────
  it('accepts an empty body and returns a server-generated sessionId (201)', async () => {
    const res = await request(app.getHttpServer()).post('/cart').send({});
    expect(res.status).toBe(201);
    // The service is called with NO caller-supplied argument.
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0].length).toBe(0);
    expect(res.body.sessionId).toBe(API_SESSION);
  });

  // ── ANY caller-supplied sessionId is rejected — even a valid UUID ───────────
  const REJECTED_SESSION_IDS: Array<[string, string]> = [
    ['attacker-chosen valid UUID', '11111111-1111-4111-8111-111111111111'],
    ['another valid UUID', '123e4567-e89b-42d3-a456-426614174000'],
    ['manipulated string', 'session-manipulada-123'],
    ['short text "evil"', 'evil'],
  ];

  for (const [label, value] of REJECTED_SESSION_IDS) {
    it(`rejects a caller-supplied sessionId (${label}) with 400 and never creates a cart`, async () => {
      const res = await request(app.getHttpServer()).post('/cart').send({ sessionId: value });
      expect(res.status).toBe(400);
      expect(create).not.toHaveBeenCalled();
    });
  }

  // ── Any unexpected field is rejected (forbidNonWhitelisted) ─────────────────
  it('rejects an unexpected field (admin) with 400', async () => {
    const res = await request(app.getHttpServer()).post('/cart').send({ admin: true });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  // ── Two creations → two distinct sessionIds are the API's responsibility ────
  // (Uniqueness is asserted at the service level in cart.service.spec.ts; here we
  // only confirm the controller always delegates generation to the service.)
  it('always delegates id generation to the service (never echoes a caller value)', async () => {
    await request(app.getHttpServer()).post('/cart').send({});
    await request(app.getHttpServer()).post('/cart').send({});
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0].length).toBe(0);
    expect(create.mock.calls[1].length).toBe(0);
  });
});
