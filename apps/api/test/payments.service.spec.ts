import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from '../src/payments/payments.service';

// Phase 11H: PaymentIntent ownership + settlement hardening. Stripe, Prisma and
// EmailService are mocked; the Stripe client is overridden after construction.

const ORDER_A = 'a1111111-1111-4111-8111-111111111111';
const ORDER_B = 'b2222222-2222-4222-8222-222222222222';
// Phase 11H: order-scoped payment methods now require access credentials. These
// unit tests authorize via the registered-owner path (userId === order.customerId).
const OWNER_ID = 'cust-owner';
const CRED = { userId: OWNER_ID } as const;

function makeTx() {
  return {
    payment: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn(), update: vi.fn() },
    inventory: { findUnique: vi.fn(), update: vi.fn() },
  };
}

function makePrisma(tx: ReturnType<typeof makeTx>) {
  return {
    order: { findUnique: vi.fn() },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn(),
    },
    // Serializable interactive transaction — invoke the callback with our tx mock.
    $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
}

function makeStripe() {
  return {
    paymentIntents: { retrieve: vi.fn(), create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  };
}

function pendingOrder(id: string, totalInCents = 5000) {
  return { id, customerId: OWNER_ID, status: 'PENDING_PAYMENT', totalInCents, items: [{ variantId: 'var-1', quantity: 1 }] };
}

function build() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
  const tx = makeTx();
  const prisma = makePrisma(tx);
  const email = { sendOrderConfirmationIfNeeded: vi.fn().mockResolvedValue(undefined) };
  const stripe = makeStripe();
  const service = new PaymentsService(prisma as never, email as never);
  (service as unknown as { stripe: unknown }).stripe = stripe;
  return { service, prisma, tx, email, stripe };
}

// ─── reconcile: ownership + Stripe verification ────────────────────────────────

describe('PaymentsService.reconcilePayment — ownership & anti-fraud (I1,I3,I4,I7,I11)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it('A/I1: a PaymentIntent from another order is rejected (400), no Stripe call', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_B, currency: 'eur' }); // PI belongs to B
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_x' }, CRED),
    ).rejects.toThrow(BadRequestException);
    expect(ctx.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it('H: an unknown PaymentIntent yields 404 (no Stripe call, no 500)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A));
    ctx.prisma.payment.findUnique.mockResolvedValue(null);
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_missing' }, CRED),
    ).rejects.toThrow(NotFoundException);
    expect(ctx.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it('C/I7: order already PAID + a foreign PI still rejects (ownership before early-return)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue({ id: ORDER_A, customerId: OWNER_ID, status: 'PAID', totalInCents: 5000 });
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_B, currency: 'eur' });
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_x' }, CRED),
    ).rejects.toThrow(BadRequestException);
  });

  it('I7: order already PAID + its own PI → idempotent alreadyPaid, no settlement', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue({ id: ORDER_A, customerId: OWNER_ID, status: 'PAID', totalInCents: 5000 });
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    const res = await ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED);
    expect(res).toMatchObject({ reconciled: false, alreadyPaid: true });
    expect(ctx.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(ctx.tx.order.update).not.toHaveBeenCalled();
  });

  it('E/I3: amount mismatch does not settle (400)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'succeeded', amount: 9999, currency: 'eur', metadata: { orderId: ORDER_A },
    });
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED),
    ).rejects.toThrow(/amount/i);
    expect(ctx.tx.order.update).not.toHaveBeenCalled();
  });

  it('F/I4: currency mismatch does not settle (400)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'succeeded', amount: 5000, currency: 'usd', metadata: { orderId: ORDER_A },
    });
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED),
    ).rejects.toThrow(/currency/i);
  });

  it('G/I11: metadata.orderId pointing elsewhere is rejected (server data wins)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'succeeded', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_B },
    });
    await expect(
      ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED),
    ).rejects.toThrow(/metadata/i);
  });

  it('I/11: a not-yet-succeeded PI does not settle', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'requires_payment_method', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_A },
    });
    const res = await ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED);
    expect(res).toMatchObject({ reconciled: false, piStatus: 'requires_payment_method' });
    expect(ctx.tx.order.update).not.toHaveBeenCalled();
  });

  it('J: a legitimate succeeded PI settles the order exactly once', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'succeeded', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_A },
    });
    // Inside applyPaymentSuccess:
    ctx.tx.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 5000, currency: 'eur' });
    ctx.tx.order.findUnique.mockResolvedValue({ id: ORDER_A, status: 'PENDING_PAYMENT', totalInCents: 5000, items: [{ variantId: 'var-1', quantity: 1 }] });
    ctx.tx.inventory.findUnique.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 3 });

    const res = await ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED);
    expect(res).toMatchObject({ reconciled: true });
    expect(ctx.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID' } }));
    expect(ctx.tx.inventory.update).toHaveBeenCalledTimes(1);
  });
});

// ─── createPaymentIntent: server owns amount/currency/metadata ─────────────────

describe('PaymentsService.createPaymentIntent — server authority (I3,I4,I5,I7)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it('404 for an unknown order', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(null);
    await expect(ctx.service.createPaymentIntent({ orderId: ORDER_A }, CRED)).rejects.toThrow(NotFoundException);
  });

  it('I7: a PAID order cannot start a new payment (ORDER_ALREADY_PAID)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue({ id: ORDER_A, customerId: OWNER_ID, status: 'PAID', totalInCents: 5000 });
    await expect(ctx.service.createPaymentIntent({ orderId: ORDER_A }, CRED)).rejects.toThrow(ConflictException);
    expect(ctx.stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('I3/I4/I5: amount, currency and metadata come from the server order, not the client', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue({ id: ORDER_A, customerId: OWNER_ID, status: 'PENDING_PAYMENT', totalInCents: 7350, orderNumber: 'MORER-X' });
    ctx.prisma.payment.findFirst.mockResolvedValue(null);
    ctx.stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_new', status: 'requires_payment_method', client_secret: 'pi_new_secret_abc' });

    const res = await ctx.service.createPaymentIntent({ orderId: ORDER_A }, CRED);
    const args = ctx.stripe.paymentIntents.create.mock.calls[0][0];
    expect(args.amount).toBe(7350); // from order.totalInCents
    expect(args.currency).toBe('eur');
    expect(args.metadata.orderId).toBe(ORDER_A);
    expect(res.amountInCents).toBe(7350);
    expect(res.clientSecret).toBe('pi_new_secret_abc');
  });
});

// ─── webhook: settlement guards (I3,I4,I10) ────────────────────────────────────

async function fireSucceeded(ctx: ReturnType<typeof build>, pi: Record<string, unknown>) {
  ctx.stripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: pi } });
  return ctx.service.handleStripeWebhook(Buffer.from('{}'), 'sig');
}

describe('PaymentsService webhook — settlement guards (I3,I4,I10)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it('J: a legitimate succeeded webhook settles the order once', async () => {
    ctx.prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 5000, currency: 'eur' });
    ctx.tx.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 5000, currency: 'eur' });
    ctx.tx.order.findUnique.mockResolvedValue({ id: ORDER_A, status: 'PENDING_PAYMENT', totalInCents: 5000, items: [{ variantId: 'var-1', quantity: 1 }] });
    ctx.tx.inventory.findUnique.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 3 });

    await fireSucceeded(ctx, { id: 'pi_a', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_A } });
    expect(ctx.tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID' } }));
    expect(ctx.tx.inventory.update).toHaveBeenCalledTimes(1);
  });

  it('E/I3: a webhook whose Payment amount != order total must NOT settle the order', async () => {
    // e.g. a Payment created from metadata with a mismatched amount.
    ctx.prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 9999, currency: 'eur' });
    ctx.tx.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 9999, currency: 'eur' });
    ctx.tx.order.findUnique.mockResolvedValue({ id: ORDER_A, status: 'PENDING_PAYMENT', totalInCents: 5000, items: [{ variantId: 'var-1', quantity: 1 }] });
    ctx.tx.inventory.findUnique.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 3 });

    await fireSucceeded(ctx, { id: 'pi_a', amount: 9999, currency: 'eur', metadata: { orderId: ORDER_A } });
    expect(ctx.tx.order.update).not.toHaveBeenCalled(); // never PAID on a mismatch
    expect(ctx.tx.inventory.update).not.toHaveBeenCalled();
  });

  it('F/I4: a webhook with a mismatched currency must NOT settle the order', async () => {
    ctx.prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 5000, currency: 'usd' });
    ctx.tx.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'PENDING', amountInCents: 5000, currency: 'usd' });
    ctx.tx.order.findUnique.mockResolvedValue({ id: ORDER_A, status: 'PENDING_PAYMENT', totalInCents: 5000, items: [{ variantId: 'var-1', quantity: 1 }] });
    ctx.tx.inventory.findUnique.mockResolvedValue({ stockQuantity: 10, reservedQuantity: 3 });

    await fireSucceeded(ctx, { id: 'pi_a', amount: 5000, currency: 'usd', metadata: { orderId: ORDER_A } });
    expect(ctx.tx.order.update).not.toHaveBeenCalled();
  });

  it('I10: a duplicate webhook (Payment already SUCCEEDED) applies no further effects', async () => {
    ctx.prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'SUCCEEDED', amountInCents: 5000, currency: 'eur' });
    await fireSucceeded(ctx, { id: 'pi_a', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_A } });
    // Short-circuits before the transaction — no settlement work.
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    expect(ctx.email.sendOrderConfirmationIfNeeded).toHaveBeenCalled(); // retries the email only
  });

  it('rejects an invalid webhook signature (400)', async () => {
    ctx.stripe.webhooks.constructEvent.mockImplementation(() => { throw new Error('bad sig'); });
    await expect(ctx.service.handleStripeWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(BadRequestException);
  });
});

// ─── applyPaymentSuccess idempotency (I8) ──────────────────────────────────────

describe('PaymentsService — settlement idempotency (I8)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it('a reconcile whose payment is already SUCCEEDED does not decrement stock again', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(pendingOrder(ORDER_A, 5000));
    ctx.prisma.payment.findUnique.mockResolvedValue({ orderId: ORDER_A, currency: 'eur' });
    ctx.stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_a', status: 'succeeded', amount: 5000, currency: 'eur', metadata: { orderId: ORDER_A },
    });
    // applyPaymentSuccess sees an already-SUCCEEDED payment.
    ctx.tx.payment.findUnique.mockResolvedValue({ id: 'pay-1', orderId: ORDER_A, status: 'SUCCEEDED', amountInCents: 5000, currency: 'eur' });
    ctx.tx.order.findUnique.mockResolvedValue({ id: ORDER_A, status: 'PAID', totalInCents: 5000, items: [{ variantId: 'var-1', quantity: 1 }] });

    const res = await ctx.service.reconcilePayment({ orderId: ORDER_A, paymentIntentId: 'pi_a' }, CRED);
    expect(res.reconciled).toBe(false); // work already done
    expect(ctx.tx.inventory.update).not.toHaveBeenCalled();
  });
});
