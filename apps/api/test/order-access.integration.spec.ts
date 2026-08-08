/// <reference types="node" />
/**
 * Phase 11H — Order access authorization (Option 1 + 2). Closes 11H-ORDER-IDOR,
 * 11H-ORDER-CANCEL, 11H-PAY-INFO, PAY-31, PAY-32.
 *
 * The orderId is a RESOURCE id, never a credential. Access requires the JWT owner
 * (registered order) or a valid guest capability (X-Order-Access-Token). Every
 * unauthorized case collapses to a uniform 404.
 *
 * Real CheckoutController + PaymentsController run with Prisma/Stripe/Email mocked.
 * The OptionalJwtAuthGuard is overridden to map `x-test-user` → req.user (a stand-in
 * for a validated JWT, which always implies a registered customer).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { default as supertestDefault } from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = supertestDefault as unknown as (app: any) => import('supertest').SuperTest<import('supertest').Test>;

import { CheckoutController } from '../src/checkout/checkout.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/database/prisma.service';
import { EmailService } from '../src/email/email.service';
import { OptionalJwtAuthGuard } from '../src/auth/guards/optional-jwt-auth.guard';
import { ProxyAwareThrottlerGuard } from '../src/common/proxy-aware-throttler.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { generateOrderAccessToken, hashOrderAccessToken } from '../src/checkout/order-access';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const ORDER_A = 'a1111111-1111-4111-8111-111111111111'; // registered, owned by USER_A
const ORDER_G = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; // guest, protected by capability
const USER_A = 'user-a';
const USER_B = 'user-b';

const guest = generateOrderAccessToken();          // { token, hash } for ORDER_G
const otherGuest = generateOrderAccessToken();     // a different guest's capability

const ADDR = {
  fullName: 'Nombre Ficticio', phone: '+34600111222', line1: 'Calle Ejemplo 42',
  line2: null, postalCode: '08001', city: 'Barcelona', province: 'Barcelona', countryCode: 'ES',
};

function registeredOrder(status = 'PENDING_PAYMENT') {
  return {
    id: ORDER_A, orderNumber: 'MORER-A', customerId: USER_A, accessTokenHash: null,
    status, totalInCents: 5000, shippingInCents: 0, taxInCents: 0,
    shippingAddressSnapshot: ADDR, billingAddressSnapshot: ADDR,
    createdAt: new Date('2020-01-01T00:00:00.000Z'),
    items: [{ id: 'it1', variantId: 'var-1', productName: 'Camiseta', variantSize: 'M', quantity: 1, priceInCents: 5000 }],
  };
}
function guestOrder(status = 'PENDING_PAYMENT') {
  return { ...registeredOrder(status), id: ORDER_G, orderNumber: 'MORER-G', customerId: 'guest-cust', accessTokenHash: guest.hash };
}

const tx = {
  order: { findUnique: vi.fn(), update: vi.fn() },
  inventory: { findUnique: vi.fn(), update: vi.fn() },
};
const prismaMock = {
  order: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  payment: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn().mockResolvedValue({}) },
  customer: { findUnique: vi.fn() },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: vi.fn(async (cb: (t: any) => unknown) => cb(tx)),
};

const testAuthGuard = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: { id: string } }>();
    const uid = req.headers['x-test-user'];
    if (uid) req.user = { id: uid };
    return true;
  },
};

// Point both order.findUnique (payments/find) and tx.order.findUnique (cancel) at the
// same row, plus the checkout include path.
function useOrder(order: unknown): void {
  prismaMock.order.findUnique.mockResolvedValue(order);
  tx.order.findUnique.mockResolvedValue(order);
  tx.order.update.mockResolvedValue({ ...(order as object), status: 'CANCELLED' });
  tx.inventory.findUnique.mockResolvedValue({ reservedQuantity: 5, stockQuantity: 10 });
}

async function buildApp(): Promise<INestApplication> {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  const moduleRef = await Test.createTestingModule({
    controllers: [CheckoutController, PaymentsController],
    providers: [
      CheckoutService,
      PaymentsService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: EmailService, useValue: { sendOrderConfirmationIfNeeded: vi.fn() } },
    ],
  })
    .overrideGuard(OptionalJwtAuthGuard).useValue(testAuthGuard)
    .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
    .overrideGuard(ProxyAwareThrottlerGuard).useValue({ canActivate: () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const svc = moduleRef.get(PaymentsService) as unknown as { stripe: unknown };
  svc.stripe = {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: 'pi_new', status: 'requires_payment_method', client_secret: 'pi_new_secret_x' }),
      retrieve: vi.fn(),
    },
    webhooks: { constructEvent: vi.fn() },
  };
  return app;
}

// ─── HTTP access matrix (ORDER-AUTH 01–16, 25 + PAY-31/32) ─────────────────────

describe('Order access — HTTP matrix (11H)', () => {
  let app: INestApplication;
  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.payment.findMany.mockResolvedValue([]);
    prismaMock.payment.upsert.mockResolvedValue({});
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  const get = (id: string) => request(app.getHttpServer()).get(`/checkout/orders/${id}`);
  const cancel = (id: string) => request(app.getHttpServer()).post(`/checkout/orders/${id}/cancel`);
  const createPI = (id: string) => request(app.getHttpServer()).post('/payments/create-intent').send({ orderId: id });
  const payments = (id: string) => request(app.getHttpServer()).get(`/payments/order/${id}`);

  it('ORDER-AUTH-01 / 20: registered owner GET → 200; capability never in the public JSON', async () => {
    useOrder(registeredOrder());
    const res = await get(ORDER_A).set('x-test-user', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.shippingAddress.line1).toBe(ADDR.line1);
    // ORDER-AUTH-20: neither the capability nor its hash nor customerId leak.
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('accessTokenHash');
    expect(res.body).not.toHaveProperty('customerId');
  });

  it('ORDER-AUTH-02: registered User B GET Order A → 404 (no PII, no existence leak)', async () => {
    useOrder(registeredOrder());
    const res = await get(ORDER_A).set('x-test-user', USER_B);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(ADDR.line1);
  });

  it('ORDER-AUTH-03: registered User B cancel Order A → 404, reserved stock untouched', async () => {
    useOrder(registeredOrder());
    const res = await cancel(ORDER_A).set('x-test-user', USER_B);
    expect(res.status).toBe(404);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('ORDER-AUTH-04: guest owner GET with a valid capability → 200', async () => {
    useOrder(guestOrder());
    const res = await get(ORDER_G).set('x-order-access-token', guest.token);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ORDER_G);
  });

  it('ORDER-AUTH-05: guest GET with only the orderId (no token) → 404', async () => {
    useOrder(guestOrder());
    const res = await get(ORDER_G);
    expect(res.status).toBe(404);
  });

  it('ORDER-AUTH-06: guest GET with a wrong token → 404', async () => {
    useOrder(guestOrder());
    const res = await get(ORDER_G).set('x-order-access-token', 'not-the-token');
    expect(res.status).toBe(404);
  });

  it('ORDER-AUTH-07 / 25: guest B token on Order A(guest) → 404 (token of A ≠ B)', async () => {
    useOrder(guestOrder());
    const res = await get(ORDER_G).set('x-order-access-token', otherGuest.token);
    expect(res.status).toBe(404);
  });

  it('ORDER-AUTH-08: guest with a valid token cancels its own PENDING order → 200 CANCELLED', async () => {
    useOrder(guestOrder());
    const res = await cancel(ORDER_G).set('x-order-access-token', guest.token);
    expect([200, 201]).toContain(res.status);
    expect(res.body.status).toBe('CANCELLED');
    expect(tx.inventory.update).toHaveBeenCalled();
  });

  it('ORDER-AUTH-09: guest invalid token cancel → 404, reserved stock untouched', async () => {
    useOrder(guestOrder());
    const res = await cancel(ORDER_G).set('x-order-access-token', 'wrong');
    expect(res.status).toBe(404);
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('ORDER-AUTH-10: nonexistent order → same 404 surface as an invalid token', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    tx.order.findUnique.mockResolvedValue(null);
    const missing = await get(ORDER_A).set('x-test-user', USER_A);
    useOrder(guestOrder());
    const wrongToken = await get(ORDER_G).set('x-order-access-token', 'wrong');
    expect(missing.status).toBe(404);
    expect(wrongToken.status).toBe(404);
    expect(missing.body.message).toBe(wrongToken.body.message);
  });

  it('ORDER-AUTH-11: GET /payments/order owner → 200', async () => {
    useOrder(registeredOrder());
    const res = await payments(ORDER_A).set('x-test-user', USER_A);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('ORDER-AUTH-12 / PAY-INFO: GET /payments/order foreign → 404', async () => {
    useOrder(registeredOrder());
    const res = await payments(ORDER_A).set('x-test-user', USER_B);
    expect(res.status).toBe(404);
  });

  it('ORDER-AUTH-13: create-intent owner → allowed (clientSecret returned)', async () => {
    useOrder(registeredOrder());
    const res = await createPI(ORDER_A).set('x-test-user', USER_A);
    expect([200, 201]).toContain(res.status);
    expect(res.body.clientSecret).toBe('pi_new_secret_x');
  });

  it('ORDER-AUTH-14 / 15 / PAY-31: create-intent for Order A as User B → 404, no Stripe call', async () => {
    useOrder(registeredOrder());
    const res = await createPI(ORDER_A).set('x-test-user', USER_B);
    expect(res.status).toBe(404);
    const svc = (app.get(PaymentsService) as unknown as { stripe: { paymentIntents: { create: ReturnType<typeof vi.fn> } } });
    expect(svc.stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('ORDER-AUTH-16 / PAY-32: guest B cannot operate Order A(guest) with only the UUID → 404', async () => {
    useOrder(guestOrder());
    const res = await createPI(ORDER_G); // no token at all
    expect(res.status).toBe(404);
  });
});

// ─── Token issuance & lookup (ORDER-AUTH 17–24) ────────────────────────────────

describe('Order access — capability issuance & lookup (11H)', () => {
  it('ORDER-AUTH-23 / 24: guest checkout mints a stored HASH ≠ plaintext, unique per order', async () => {
    const results: Array<{ token: string; hash: string }> = [];
    for (const cartId of ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'b2c3d4e5-f6a7-8901-bcde-f12345678901']) {
      const mock = createPrismaMock();
      mock.__tx.cart.findUnique.mockResolvedValue({
        id: cartId, status: 'ACTIVE',
        items: [{ id: 'i1', variantId: 'v1', quantity: 1, priceInCents: 1000, variant: { id: 'v1', size: 'M', priceInCents: 1000, status: 'ACTIVE', deletedAt: null, product: { name: 'T', status: 'ACTIVE' }, inventory: { stockQuantity: 5, reservedQuantity: 0 } } }],
      });
      mock.__tx.inventory.update.mockResolvedValue({});
      mock.__tx.customer.upsert.mockResolvedValue({ id: 'guest' });
      mock.__tx.order.create.mockResolvedValue({ id: 'o', orderNumber: 'MORER-X', customerId: 'guest', status: 'PENDING_PAYMENT', totalInCents: 1000, shippingInCents: 0, taxInCents: 0, createdAt: new Date('2020-01-01'), items: [] });
      mock.__tx.cart.update.mockResolvedValue({});
      const service = new CheckoutService(asPrismaService(mock));
      const res = await service.startCheckout({ cartId, email: 'guest@example.com' });
      const data = mock.__tx.order.create.mock.calls[0][0].data as { accessTokenHash: string };
      // Stored value is the SHA-256 of the returned token, never the token itself.
      expect(data.accessTokenHash).toBe(hashOrderAccessToken(res.accessToken));
      expect(data.accessTokenHash).not.toBe(res.accessToken);
      results.push({ token: res.accessToken, hash: data.accessTokenHash });
    }
    expect(results[0].token).not.toBe(results[1].token); // unique per order
    expect(results[0].hash).not.toBe(results[1].hash);
  });

  it('ORDER-AUTH-17: verified lookup of a GUEST order re-mints a capability (hash stored, token returned)', async () => {
    const mock = createPrismaMock();
    mock.order.findFirst.mockResolvedValue({ id: ORDER_G, customerId: 'guest-cust' });
    mock.customer.findUnique.mockResolvedValue({ registeredAt: null, passwordHash: null }); // guest
    const service = new CheckoutService(asPrismaService(mock));
    const res = await service.lookupOrder({ orderNumber: 'MORER-G', email: 'guest@example.com' });
    expect(res.orderId).toBe(ORDER_G);
    expect(typeof res.accessToken).toBe('string');
    const updated = mock.order.update.mock.calls[0][0] as { data: { accessTokenHash: string } };
    expect(updated.data.accessTokenHash).toBe(hashOrderAccessToken(res.accessToken as string));
  });

  it('ORDER-AUTH-17b: lookup of a REGISTERED order returns id only, mints no capability', async () => {
    const mock = createPrismaMock();
    mock.order.findFirst.mockResolvedValue({ id: ORDER_A, customerId: USER_A });
    mock.customer.findUnique.mockResolvedValue({ registeredAt: new Date('2020-01-01'), passwordHash: 'x' });
    const service = new CheckoutService(asPrismaService(mock));
    const res = await service.lookupOrder({ orderNumber: 'MORER-A', email: 'a@example.com' });
    expect(res.orderId).toBe(ORDER_A);
    expect(res.accessToken).toBeUndefined();
    expect(mock.order.update).not.toHaveBeenCalled();
  });

  it('ORDER-AUTH-18 / 19: wrong email or wrong orderNumber → NotFound, no capability minted', async () => {
    const mock = createPrismaMock();
    mock.order.findFirst.mockResolvedValue(null);
    const service = new CheckoutService(asPrismaService(mock));
    await expect(service.lookupOrder({ orderNumber: 'MORER-A', email: 'wrong@example.com' })).rejects.toThrow();
    await expect(service.lookupOrder({ orderNumber: 'NOPE', email: 'a@example.com' })).rejects.toThrow();
    expect(mock.order.update).not.toHaveBeenCalled();
  });

  it('ORDER-AUTH-21: the capability never appears in server logs during issuance', async () => {
    const logged: string[] = [];
    const spyLog = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); });
    const spyErr = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logged.push(a.join(' ')); });
    try {
      const mock = createPrismaMock();
      mock.order.findFirst.mockResolvedValue({ id: ORDER_G, customerId: 'guest-cust' });
      mock.customer.findUnique.mockResolvedValue({ registeredAt: null, passwordHash: null });
      const service = new CheckoutService(asPrismaService(mock));
      const res = await service.lookupOrder({ orderNumber: 'MORER-G', email: 'guest@example.com' });
      expect(logged.join('\n')).not.toContain(res.accessToken);
    } finally {
      spyLog.mockRestore();
      spyErr.mockRestore();
    }
  });
});
