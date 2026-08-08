import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FulfillmentService } from '../src/fulfillment/fulfillment.service';

// Phase 11J (R4) — the PAID → FULFILLED transition is an atomic conditional write
// (updateMany where status=PAID). Under concurrency exactly one caller wins; the DB
// commit happens before the (idempotent) email, which never rolls the status back.

const ORDER_ID = 'a1111111-1111-4111-8111-111111111111';
const TRACKING = 'GLS-ES-12345678';

function build() {
  const prisma = { order: { findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const email = { sendShippingConfirmationIfNeeded: vi.fn().mockResolvedValue(undefined) };
  const service = new FulfillmentService(prisma as never, email as never);
  return { service, prisma, email };
}

function paid(over: Record<string, unknown> = {}) {
  return { id: ORDER_ID, status: 'PAID', trackingNumber: null, shippingEmailSentAt: null, ...over };
}

describe('FulfillmentService.shipOrder — atomic transition (11J R4)', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => { ctx = build(); });

  it('SHIP-TX-01: PAID → FULFILLED via a conditional claim guarded by status=PAID', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid());
    const res = await ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING });
    expect(res.status).toBe('FULFILLED');
    const claimArgs = ctx.prisma.order.updateMany.mock.calls[0][0];
    expect(claimArgs.where).toMatchObject({ id: ORDER_ID, status: 'PAID' });
    expect(claimArgs.data).toMatchObject({ status: 'FULFILLED', trackingNumber: TRACKING });
    expect(ctx.email.sendShippingConfirmationIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('SHIP-TX-02: two concurrent ships → exactly one winner, exactly one email', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid());
    // First claim wins (count 1); the second observes it already claimed (count 0).
    ctx.prisma.order.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([
      ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING }),
      ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING }),
    ]);
    expect(a.status).toBe('FULFILLED');
    expect(b.status).toBe('FULFILLED');
    // Only the winner sends the email — the loser short-circuits on count === 0.
    expect(ctx.email.sendShippingConfirmationIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('SHIP-TX-03: duplicate ship (already FULFILLED, same tracking, email sent) → idempotent no-op', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(
      paid({ status: 'FULFILLED', trackingNumber: TRACKING, shippingEmailSentAt: new Date('2020-01-01') }),
    );
    const res = await ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING });
    expect(res.status).toBe('FULFILLED');
    expect(ctx.prisma.order.updateMany).not.toHaveBeenCalled();
    expect(ctx.email.sendShippingConfirmationIfNeeded).not.toHaveBeenCalled();
  });

  it('SHIP-TX-04: a different tracking number after fulfillment → 400 conflict', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid({ status: 'FULFILLED', trackingNumber: 'OTHER-TRACKING' }));
    await expect(ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING })).rejects.toThrow(BadRequestException);
    expect(ctx.prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('SHIP-TX-05: a DB failure on the claim → no email is sent', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid());
    ctx.prisma.order.updateMany.mockRejectedValue(new Error('db down'));
    await expect(ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING })).rejects.toThrow();
    expect(ctx.email.sendShippingConfirmationIfNeeded).not.toHaveBeenCalled();
  });

  it('SHIP-TX-06: the winner commits FULFILLED before the (idempotent) email; email is retryable', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid());
    // EmailService swallows provider errors internally, so shipOrder resolves. The
    // status was committed by the claim (updateMany) regardless of email outcome.
    const res = await ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING });
    expect(res.status).toBe('FULFILLED');
    expect(ctx.prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(ctx.email.sendShippingConfirmationIfNeeded).toHaveBeenCalledTimes(1); // after the commit
  });

  it('SHIP-TX-07: CANCELLED → no transition (400)', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid({ status: 'CANCELLED' }));
    await expect(ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING })).rejects.toThrow(BadRequestException);
    expect(ctx.prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('SHIP-TX-08: PENDING_PAYMENT → no transition (400); unknown order → 404', async () => {
    ctx.prisma.order.findUnique.mockResolvedValue(paid({ status: 'PENDING_PAYMENT' }));
    await expect(ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING })).rejects.toThrow(BadRequestException);
    ctx.prisma.order.findUnique.mockResolvedValue(null);
    await expect(ctx.service.shipOrder(ORDER_ID, { trackingNumber: TRACKING })).rejects.toThrow(NotFoundException);
    expect(ctx.prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
