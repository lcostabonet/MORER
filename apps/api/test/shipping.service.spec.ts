/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../src/email/email.service';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';
import type { PrismaMock } from './helpers/prisma-mock';

// ─── Module-level mocks (hoisted by Vitest) ───────────────────────────────────
//
// Same vi.hoisted + class MockResend pattern as email.service.spec.ts.
// `resend` is mocked with a real class so `new Resend(key)` inside EmailService
// works correctly.
// `@morer/emails` is mocked so React Email rendering is skipped.

const resendMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    readonly emails = { send: resendMocks.send };
    constructor(apiKey: string) {
      resendMocks.constructor(apiKey);
    }
  },
}));

vi.mock('@morer/emails', () => ({
  renderOrderConfirmation: vi.fn().mockResolvedValue('<html>order confirmation mock</html>'),
  renderShippingConfirmation: vi.fn().mockResolvedValue('<html>shipping confirmation mock</html>'),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORDER_NUMBER = 'MORER-SHIP-TEST';
const CUSTOMER_EMAIL = 'cliente@ejemplo.com';
const TRACKING_NUMBER = 'GLS-ES-12345678';
const TRACKING_URL = 'https://gls-group.com/track?id=GLS-ES-12345678';

function fulfilledOrderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    // Dev step 1 analysis: the fulfilled/shipped state is FULFILLED (no SHIPPED in schema)
    status: 'FULFILLED',
    email: CUSTOMER_EMAIL,
    trackingNumber: TRACKING_NUMBER,
    trackingUrl: TRACKING_URL,
    shippingEmailSentAt: null,
    shippingEmailSendingAt: null,
    items: [
      {
        productName: 'Camiseta',
        variantSize: 'M',
        quantity: 2,
      },
    ],
    ...overrides,
  };
}

// ─── EmailService.sendShippingConfirmationIfNeeded tests ──────────────────────

describe('EmailService.sendShippingConfirmationIfNeeded (Phase 10B-alpha)', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let mock: PrismaMock;
  let service: EmailService;

  beforeEach(() => {
    process.env['RESEND_API_KEY'] = 'test-resend-key';
    process.env['EMAIL_FROM'] = 'noreply@test.morer.com';

    resendMocks.send.mockResolvedValue({ data: { id: 'ship-email-id-001' }, error: null });
    mockSend = resendMocks.send;

    mock = createPrismaMock();
    service = new EmailService(asPrismaService(mock));
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.clearAllMocks();
  });

  // Test 1: sends to Order.email when all conditions are met
  it('sends the shipping confirmation to Order.email when all conditions are met', async () => {
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: CUSTOMER_EMAIL }),
    );
  });

  // Test 2: marks shippingEmailSentAt after Resend accepts
  it('marks shippingEmailSentAt after Resend accepts (atomic claim then mark-sent)', async () => {
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    // Two updateMany calls: first is the atomic claim (shippingEmailSendingAt),
    // second is the final mark (shippingEmailSentAt + release claim).
    expect(mock.order.updateMany).toHaveBeenCalledTimes(2);

    // First call: atomic claim
    expect(mock.order.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: ORDER_ID,
          shippingEmailSentAt: null,
        }),
        data: expect.objectContaining({ shippingEmailSendingAt: expect.any(Date) }),
      }),
    );

    // Second call: mark sent and release claim
    expect(mock.order.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: ORDER_ID }),
        data: expect.objectContaining({
          shippingEmailSentAt: expect.any(Date),
          shippingEmailSendingAt: null,
        }),
      }),
    );
  });

  // Test 3a: does not send when order is PAID (not FULFILLED)
  it('does not send when order status is PAID', async () => {
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ status: 'PAID' }),
    );

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 3b: does not send when order is PENDING_PAYMENT
  it('does not send when order status is PENDING_PAYMENT', async () => {
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ status: 'PENDING_PAYMENT' }),
    );

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 4: does not send when trackingNumber is null
  it('does not send when trackingNumber is null', async () => {
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ trackingNumber: null }),
    );

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 5: does not send when email is null
  it('does not send when Order.email is null', async () => {
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ email: null }),
    );

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 6: skips when shippingEmailSentAt is already set (idempotency)
  it('skips sending when shippingEmailSentAt is already set (idempotency)', async () => {
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ shippingEmailSentAt: new Date('2026-06-24T12:00:00Z') }),
    );

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 7: sends at most once when called twice (double-webhook / duplicate trigger)
  it('sends at most once when called twice for the same order (duplicate webhook)', async () => {
    // First call: shippingEmailSentAt is null → sends and marks.
    mock.order.findUnique.mockResolvedValueOnce(fulfilledOrderFixture());
    await service.sendShippingConfirmationIfNeeded(ORDER_ID);
    expect(mockSend).toHaveBeenCalledOnce();

    // Second call (duplicate webhook): column is now set → skips.
    mock.order.findUnique.mockResolvedValueOnce(
      fulfilledOrderFixture({ shippingEmailSentAt: new Date() }),
    );
    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    // Total: still only 1 send.
    expect(mockSend).toHaveBeenCalledOnce();
  });

  // Test 8: absorbs a provider error without throwing
  it('absorbs a provider error without throwing (fulfillment status unaffected)', async () => {
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());
    mockSend.mockRejectedValueOnce(new Error('Resend API unreachable'));

    // Must not throw — the caller (FulfillmentService) must not roll back the status.
    await expect(service.sendShippingConfirmationIfNeeded(ORDER_ID)).resolves.toBeUndefined();
  });

  // Test 9: does not mark shippingEmailSentAt after a provider failure (allows retry)
  it('does not mark shippingEmailSentAt after a provider failure (allows retry)', async () => {
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());
    mockSend.mockRejectedValueOnce(new Error('Resend timeout'));

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    // The claim updateMany fires first, then the release updateMany fires on failure.
    // shippingEmailSentAt must never be set — only shippingEmailSendingAt is touched.
    const updateManyCalls = mock.order.updateMany.mock.calls;
    for (const [args] of updateManyCalls) {
      expect(args.data).not.toHaveProperty('shippingEmailSentAt', expect.any(Date));
    }

    // The claim must have been acquired and then released (shippingEmailSendingAt reset to null).
    expect(mock.order.updateMany).toHaveBeenCalledTimes(2);
    expect(mock.order.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ORDER_ID }),
        data: expect.objectContaining({ shippingEmailSendingAt: null }),
      }),
    );
  });

  // Test 10: does not send two emails when called concurrently (race condition idempotency)
  it('does not send two emails when called concurrently (race condition idempotency)', async () => {
    // Both concurrent callers see the same order (worst-case race: both read null).
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());

    // Sequence of updateMany returns:
    //  1st call (claim from first concurrent caller)  → count: 1 (wins the claim)
    //  2nd call (claim from second concurrent caller) → count: 0 (claim already taken)
    //  3rd call (mark sent + release from first caller after success) → count: 1
    mock.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await Promise.all([
      service.sendShippingConfirmationIfNeeded(ORDER_ID),
      service.sendShippingConfirmationIfNeeded(ORDER_ID),
    ]);

    // Exactly one Resend call — the second concurrent caller was blocked by the claim.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // Test 11: releases the claim and allows retry when Resend fails
  it('releases the claim and allows retry when Resend fails', async () => {
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());

    // 1st updateMany: claim acquired
    // 2nd updateMany: release on error
    mock.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    mockSend.mockRejectedValueOnce(new Error('Resend timeout'));

    // Must not throw
    await expect(service.sendShippingConfirmationIfNeeded(ORDER_ID)).resolves.toBeUndefined();

    // Claim + release = 2 updateMany calls total
    expect(mock.order.updateMany).toHaveBeenCalledTimes(2);

    // shippingEmailSentAt must never appear with a Date value in any call
    const updateManyCalls = mock.order.updateMany.mock.calls;
    for (const [args] of updateManyCalls) {
      expect(args.data).not.toHaveProperty('shippingEmailSentAt', expect.any(Date));
    }
  });

  // Test 13: revived old process cannot release/complete a newer process's claim
  it('a revived old process cannot overwrite a newer claim (claimedAt WHERE guard)', async () => {
    // Scenario: process A claimed at T1, stalled, was replaced by process B (T2).
    // Process A revives, sends the email, then tries to mark sent — but the
    // WHERE { shippingEmailSendingAt: T1 } no longer matches (DB now has T2),
    // so its updateMany returns count: 0 and is a no-op.
    mock.order.findUnique.mockResolvedValue(fulfilledOrderFixture());

    mock.order.updateMany
      .mockResolvedValueOnce({ count: 1 })  // process A claims (T1)
      .mockResolvedValueOnce({ count: 0 }); // mark-sent: no-op (DB value is now T2)

    // Must not throw
    await expect(service.sendShippingConfirmationIfNeeded(ORDER_ID)).resolves.toBeUndefined();

    // Resend was called (process A did send)
    expect(mockSend).toHaveBeenCalledTimes(1);

    // The mark-sent updateMany WHERE must carry shippingEmailSendingAt (= claimedAt)
    // so an old T1 cannot accidentally match when DB holds T2.
    expect(mock.order.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: ORDER_ID,
          shippingEmailSendingAt: expect.any(Date),
        }),
      }),
    );
  });

  // Test 12: recovers a stale claim older than 5 minutes and sends the email
  it('recovers a stale claim older than 5 minutes and sends the email', async () => {
    // shippingEmailSendingAt is 6 min ago — past the 5 min stale threshold
    mock.order.findUnique.mockResolvedValue(
      fulfilledOrderFixture({ shippingEmailSendingAt: new Date(Date.now() - 6 * 60 * 1000) }),
    );

    // 1st updateMany: stale claim overridden (count: 1)
    // 2nd updateMany: mark sent + release (count: 1)
    mock.order.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await service.sendShippingConfirmationIfNeeded(ORDER_ID);

    // Email sent once
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Final updateMany marks shippingEmailSentAt and resets shippingEmailSendingAt to null
    expect(mock.order.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ORDER_ID }),
        data: expect.objectContaining({
          shippingEmailSentAt: expect.any(Date),
          shippingEmailSendingAt: null,
        }),
      }),
    );
  });
});
