/// <reference types="node" />
/**
 * Phase 11H — HTTP-boundary tests for POST /payments/reconcile.
 *
 * The real PaymentsService runs (Prisma + Email mocked). The OptionalJwtAuthGuard is
 * overridden to map an `x-test-user` header to req.user, so we can exercise the
 * registered-owner authorization path without a real JWT. These cover:
 *   • order-access gate: no credential on a foreign order → 404 (no existence leak);
 *   • cross-order PaymentIntent (owner of B, PI belongs to A) → 400, no PI leak;
 *   • unknown PaymentIntent → 404; malformed orderId → 400.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { default as supertestDefault } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = supertestDefault as unknown as (app: any) => import('supertest').SuperTest<import('supertest').Test>;

import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/email/email.service';
import { OptionalJwtAuthGuard } from '../src/auth/guards/optional-jwt-auth.guard';

const ORDER_A = 'a1111111-1111-4111-8111-111111111111';
const ORDER_B = 'b2222222-2222-4222-8222-222222222222';
const OWNER_B = 'cust-b';

const prismaMock = {
  order: { findUnique: vi.fn() },
  payment: { findUnique: vi.fn() },
};

// Maps the x-test-user header onto req.user, standing in for a validated JWT.
const testAuthGuard = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: { id: string } }>();
    const uid = req.headers['x-test-user'];
    if (uid) req.user = { id: uid };
    return true;
  },
};

async function buildApp(): Promise<INestApplication> {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  const moduleRef = await Test.createTestingModule({
    controllers: [PaymentsController],
    providers: [
      PaymentsService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: EmailService, useValue: { sendOrderConfirmationIfNeeded: vi.fn() } },
    ],
  })
    .overrideGuard(OptionalJwtAuthGuard)
    .useValue(testAuthGuard)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  // Guard against any accidental Stripe call in these paths.
  const svc = moduleRef.get(PaymentsService) as unknown as { stripe: { paymentIntents: { retrieve: ReturnType<typeof vi.fn> } } };
  svc.stripe = { paymentIntents: { retrieve: vi.fn() } } as never;
  return app;
}

describe('POST /payments/reconcile — order access + IDOR at the HTTP boundary (11H)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    prismaMock.order.findUnique.mockReset();
    prismaMock.payment.findUnique.mockReset();
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it('rejects reconcile on a foreign order with NO credential (404, no existence leak)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: ORDER_B, customerId: OWNER_B, status: 'PENDING_PAYMENT', totalInCents: 5000 });
    const res = await request(app.getHttpServer())
      .post('/payments/reconcile')
      .send({ orderId: ORDER_B, paymentIntentId: 'pi_a' }); // no x-test-user, no capability
    expect(res.status).toBe(404);
    // Payment is never even looked up — access is denied first.
    expect(prismaMock.payment.findUnique).not.toHaveBeenCalled();
  });

  it('owner of B reconciling with a PaymentIntent that belongs to A → 400 (no PI leak)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: ORDER_B, customerId: OWNER_B, status: 'PENDING_PAYMENT', totalInCents: 5000 });
    prismaMock.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' }); // PI belongs to A
    const res = await request(app.getHttpServer())
      .post('/payments/reconcile')
      .set('x-test-user', OWNER_B)
      .send({ orderId: ORDER_B, paymentIntentId: 'pi_a' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('pi_a');
  });

  it('returns 404 for an unknown PaymentIntent on an owned order (no 500, no stack)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: ORDER_B, customerId: OWNER_B, status: 'PENDING_PAYMENT', totalInCents: 5000 });
    prismaMock.payment.findUnique.mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .post('/payments/reconcile')
      .set('x-test-user', OWNER_B)
      .send({ orderId: ORDER_B, paymentIntentId: 'pi_missing' });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:|stack/i);
  });

  it('returns 400 for a malformed orderId (controlled validation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/reconcile')
      .set('x-test-user', OWNER_B)
      .send({ orderId: 'not-a-uuid', paymentIntentId: 'pi_a' });
    expect(res.status).toBe(400);
  });
});
