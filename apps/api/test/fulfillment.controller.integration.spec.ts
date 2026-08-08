/// <reference types="node" />
/**
 * Phase 11J — Fulfillment admin authorization (real admin JWT + RBAC).
 *
 * Shipping is a back-office / ops action. It now requires a valid ADMIN JWT AND an
 * ADMIN/OPERATIONS role — a customer JWT, the guest order capability, and order
 * ownership grant NO power. The AdminJwtAuthGuard is overridden to map an
 * `x-test-admin-role` header onto req.user (a stand-in for a verified admin token);
 * the real AdminRolesGuard then enforces the role.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { default as supertestDefault } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = supertestDefault as unknown as (app: any) => import('supertest').SuperTest<import('supertest').Test>;

import { FulfillmentController } from '../src/fulfillment/fulfillment.controller';
import { FulfillmentService } from '../src/fulfillment/fulfillment.service';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/email/email.service';
import { AdminJwtAuthGuard } from '../src/admin/guards/admin-jwt-auth.guard';

const ORDER_ID = 'a1111111-1111-4111-8111-111111111111';
const TRACKING = 'GLS-ES-12345678';

const prismaMock = { order: { findUnique: vi.fn(), updateMany: vi.fn() } };
const emailMock = { sendShippingConfirmationIfNeeded: vi.fn().mockResolvedValue(undefined) };

function paidOrder(over: Record<string, unknown> = {}) {
  return { id: ORDER_ID, status: 'PAID', trackingNumber: null, shippingEmailSentAt: null, ...over };
}

// Stand-in for a verified admin token: maps x-test-admin-role → req.user.role.
// No header ⇒ 401 (as AdminJwtAuthGuard would for a missing/invalid/customer token).
const adminAuthStub = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const role = req.headers['x-test-admin-role'];
    if (!role) throw new UnauthorizedException('Admin authorization required');
    req.user = { id: 'admin-1', email: 'ops@morer.local', role };
    return true;
  },
};

async function buildApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [FulfillmentController],
    providers: [
      FulfillmentService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: EmailService, useValue: emailMock },
    ],
  })
    .overrideGuard(AdminJwtAuthGuard)
    .useValue(adminAuthStub)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

const ship = (app: INestApplication) =>
  request(app.getHttpServer()).post(`/fulfillment/orders/${ORDER_ID}/ship`);

describe('POST /fulfillment/orders/:id/ship — admin JWT + RBAC (11J)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    vi.clearAllMocks();
    emailMock.sendShippingConfirmationIfNeeded.mockResolvedValue(undefined);
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  // ── Authorization (ADMIN-07..10 + FULFILL-01..06) ────────────────────────────

  it('FULFILL-01 / ADMIN: anonymous (no admin token) → 401, order untouched', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).send({ trackingNumber: TRACKING });
    expect(res.status).toBe(401);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('FULFILL-02 / ADMIN-09: a normal customer JWT (no admin token) → 401', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('Authorization', 'Bearer a-customer-jwt').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(401);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('FULFILL-03 / ADMIN-10: a guest order capability → 401 (grants no admin power)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-order-access-token', 'valid-guest-capability').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(401);
  });

  it('FULFILL-04: the order owner (no admin token) → 401 — ownership ≠ admin', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('Authorization', 'Bearer owner-jwt').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(401);
  });

  it('FULFILL-05 / ADMIN-07: admin with OPERATIONS role on a PAID order → 201 FULFILLED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-test-admin-role', 'OPERATIONS').send({ trackingNumber: TRACKING, trackingUrl: 'https://gls-group.com/t?id=1' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ orderId: ORDER_ID, status: 'FULFILLED' });
    expect(prismaMock.order.updateMany).toHaveBeenCalledTimes(1);
    expect(emailMock.sendShippingConfirmationIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('FULFILL-06 / ADMIN-08: an authenticated admin with an insufficient role (SUPPORT) → 403', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-test-admin-role', 'SUPPORT').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(403);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  // ── Input / state machine (all as an ADMIN) ──────────────────────────────────

  it('FULFILL-07: malformed orderId → 400 safe error', async () => {
    const res = await request(app.getHttpServer())
      .post('/fulfillment/orders/not-a-uuid/ship')
      .set('x-test-admin-role', 'ADMIN')
      .send({ trackingNumber: TRACKING });
    expect(res.status).toBe(400);
  });

  it('FULFILL-08 / 17: nonexistent order → 404, no stack/internal leak', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:|stack|prisma/i);
  });

  it('FULFILL-09: PENDING_PAYMENT cannot ship → 400', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder({ status: 'PENDING_PAYMENT' }));
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('FULFILL-10: CANCELLED cannot ship → 400', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder({ status: 'CANCELLED' }));
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('FULFILL-12 / 13: already FULFILLED (same tracking, email sent) → idempotent, no write, no email', async () => {
    prismaMock.order.findUnique.mockResolvedValue(
      paidOrder({ status: 'FULFILLED', trackingNumber: TRACKING, shippingEmailSentAt: new Date('2020-01-01') }),
    );
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('FULFILLED');
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(emailMock.sendShippingConfirmationIfNeeded).not.toHaveBeenCalled();
  });

  it('FULFILL-14: two concurrent admin ships resolve consistently to FULFILLED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([
      ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING }),
      ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: TRACKING }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Exactly one winner sends the email.
    expect(emailMock.sendShippingConfirmationIfNeeded).toHaveBeenCalledTimes(1);
  });

  // ── DTO hardening ────────────────────────────────────────────────────────────

  it('FULFILL-15: mass-assignment extra fields are rejected (whitelist), order untouched', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({
      trackingNumber: TRACKING, status: 'PAID', customerId: 'evil', orderId: 'evil', admin: true,
    });
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('FULFILL-16a: missing/empty trackingNumber → 400', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({ trackingNumber: '' });
    expect(res.status).toBe(400);
  });

  it('FULFILL-16b: a non-http(s) trackingUrl (javascript:) is rejected → 400', async () => {
    prismaMock.order.findUnique.mockResolvedValue(paidOrder());
    const res = await ship(app).set('x-test-admin-role', 'ADMIN').send({
      trackingNumber: TRACKING, trackingUrl: 'javascript:alert(1)',
    });
    expect(res.status).toBe(400);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });
});
