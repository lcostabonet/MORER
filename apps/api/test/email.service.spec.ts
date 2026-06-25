/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../src/email/email.service';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';
import type { PrismaMock } from './helpers/prisma-mock';

// ─── Module-level mocks (hoisted by Vitest) ───────────────────────────────────
//
// `resend` is mocked with a real class so `new Resend(key)` inside EmailService
// works correctly. vi.hoisted ensures the spy references are available before
// the vi.mock factory runs.
//
// `@morer/emails` is mocked so React Email rendering is skipped; the service
// logic is tested in isolation from the template.
// Template rendering is covered in order-confirmation-email.spec.ts.

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
  renderWelcome: vi.fn().mockResolvedValue('<html>welcome mock</html>'),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const ORDER_NUMBER = 'MORER-ABC1-XYZ2';
const CUSTOMER_EMAIL = 'cliente@ejemplo.com';

function paidOrderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    status: 'PAID',
    email: CUSTOMER_EMAIL,
    totalInCents: 5000,
    confirmationEmailSentAt: null,
    items: [
      {
        productName: 'Camiseta',
        variantSize: 'M',
        quantity: 1,
        priceInCents: 5000,
      },
    ],
    ...overrides,
  };
}

// ─── EmailService tests ───────────────────────────────────────────────────────

describe('EmailService.sendOrderConfirmationIfNeeded (Phase 10A)', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let mock: PrismaMock;
  let service: EmailService;

  beforeEach(() => {
    // Provide env vars so the EmailService constructor does not throw.
    process.env['RESEND_API_KEY'] = 'test-resend-key';
    process.env['EMAIL_FROM'] = 'noreply@test.morer.com';

    // resendMocks.send is the hoisted vi.fn() wired directly into MockResend.emails.send.
    // Set a passing default; individual tests override it with mockRejectedValueOnce etc.
    resendMocks.send.mockResolvedValue({ data: { id: 'email-id-001' }, error: null });
    mockSend = resendMocks.send;

    mock = createPrismaMock();
    service = new EmailService(asPrismaService(mock));
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.clearAllMocks();
  });

  // Test 8: provider is fully mocked — assert no real Resend SDK is called
  it('uses the mocked Resend constructor (no real network calls)', () => {
    // The service was constructed in beforeEach — MockResend() was called exactly once.
    expect(resendMocks.constructor).toHaveBeenCalledOnce();
    expect(resendMocks.constructor).toHaveBeenCalledWith('test-resend-key');
  });

  // Test 2: sends to Order.email
  it('sends the confirmation to the email address stored in Order.email', async () => {
    mock.order.findUnique.mockResolvedValue(paidOrderFixture());

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: CUSTOMER_EMAIL }),
    );
  });

  it('marks confirmationEmailSentAt after the provider accepts the email', async () => {
    mock.order.findUnique.mockResolvedValue(paidOrderFixture());

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mock.order.updateMany).toHaveBeenCalledOnce();
    expect(mock.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ORDER_ID, confirmationEmailSentAt: null },
        data: expect.objectContaining({ confirmationEmailSentAt: expect.any(Date) }),
      }),
    );
  });

  // Test 3: only sends for PAID orders
  it('does not send for a PENDING_PAYMENT order', async () => {
    mock.order.findUnique.mockResolvedValue(
      paidOrderFixture({ status: 'PENDING_PAYMENT' }),
    );

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  it('does not send for a CANCELLED order', async () => {
    mock.order.findUnique.mockResolvedValue(
      paidOrderFixture({ status: 'CANCELLED' }),
    );

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 4: duplicate webhook → single send
  it('skips sending when confirmationEmailSentAt is already set (idempotency)', async () => {
    mock.order.findUnique.mockResolvedValue(
      paidOrderFixture({ confirmationEmailSentAt: new Date('2026-01-01T00:00:00Z') }),
    );

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  it('sends at most once when called twice for the same order (two webhook deliveries)', async () => {
    // First call: column is null → sends and marks.
    mock.order.findUnique.mockResolvedValueOnce(paidOrderFixture());
    await service.sendOrderConfirmationIfNeeded(ORDER_ID);
    expect(mockSend).toHaveBeenCalledOnce();

    // Second call (duplicate webhook): column is now set → skips.
    mock.order.findUnique.mockResolvedValueOnce(
      paidOrderFixture({ confirmationEmailSentAt: new Date() }),
    );
    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    // Total: still only 1 send.
    expect(mockSend).toHaveBeenCalledOnce();
  });

  // Test 5: null email → no send
  it('does not send when Order.email is null (legacy order without email)', async () => {
    mock.order.findUnique.mockResolvedValue(
      paidOrderFixture({ email: null }),
    );

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  // Test 6: provider failure → payment stays confirmed, failure is recoverable
  it('absorbs a provider error without throwing — payment remains confirmed', async () => {
    mock.order.findUnique.mockResolvedValue(paidOrderFixture());
    mockSend.mockRejectedValueOnce(new Error('Resend API unreachable'));

    // Must not throw — the caller (webhook handler) must not roll back the payment.
    await expect(service.sendOrderConfirmationIfNeeded(ORDER_ID)).resolves.toBeUndefined();
  });

  it('does not mark confirmationEmailSentAt after a provider failure (allows retry)', async () => {
    mock.order.findUnique.mockResolvedValue(paidOrderFixture());
    mockSend.mockRejectedValueOnce(new Error('Resend timeout'));

    await service.sendOrderConfirmationIfNeeded(ORDER_ID);

    // Column must remain null so the next webhook retry can attempt the send again.
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });

  it('also absorbs a Resend error object returned in the response body', async () => {
    mock.order.findUnique.mockResolvedValue(paidOrderFixture());
    // Resend SDK returns { data: null, error: { message, name } } on API errors.
    mockSend.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'Invalid from address' } });

    await expect(service.sendOrderConfirmationIfNeeded(ORDER_ID)).resolves.toBeUndefined();
    expect(mock.order.updateMany).not.toHaveBeenCalled();
  });
});

// ─── EmailService.sendWelcomeEmailIfNeeded tests (Phase 10B-beta) ─────────────

const CUSTOMER_ID = 'c1d2e3f4-a5b6-7890-cdef-123456789abc';

function registeredCustomerForWelcome(overrides: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    email: 'cliente@ejemplo.com',
    firstName: 'Joan',
    passwordHash: '$2b$12$hashedvalue',
    registeredAt: new Date('2026-01-01T00:00:00Z'),
    welcomeEmailSentAt: null,
    welcomeEmailSendingAt: null,
    ...overrides,
  };
}

describe('EmailService.sendWelcomeEmailIfNeeded (Phase 10B-beta)', () => {
  let mockSend: ReturnType<typeof vi.fn>;
  let mock: PrismaMock;
  let service: EmailService;

  beforeEach(() => {
    process.env['RESEND_API_KEY'] = 'test-resend-key';
    process.env['EMAIL_FROM'] = 'noreply@test.morer.com';
    process.env['WEB_URL'] = 'https://test.morer.com';

    resendMocks.send.mockResolvedValue({ data: { id: 'email-id-001' }, error: null });
    mockSend = resendMocks.send;

    mock = createPrismaMock();
    // Reset customer.updateMany default to { count: 1 } for welcome email claim tests
    mock.customer.updateMany.mockReset().mockResolvedValue({ count: 1 });
    service = new EmailService(asPrismaService(mock));
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.WEB_URL;
    vi.clearAllMocks();
  });

  // Test 1: customer not found
  it('returns early when customer not found', async () => {
    mock.customer.findUnique.mockResolvedValue(null);

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mock.customer.updateMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 2: passwordHash is null
  it('returns early when passwordHash is null', async () => {
    mock.customer.findUnique.mockResolvedValue(
      registeredCustomerForWelcome({ passwordHash: null }),
    );

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mock.customer.updateMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 3: anon email prefix
  it('returns early when email starts with anon-', async () => {
    mock.customer.findUnique.mockResolvedValue(
      registeredCustomerForWelcome({ email: 'anon-xyz@morer-checkout.local' }),
    );

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mock.customer.updateMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 3b: anon checkout local domain
  it('returns early when email ends with @morer-checkout.local', async () => {
    mock.customer.findUnique.mockResolvedValue(
      registeredCustomerForWelcome({ email: 'guest-12345@morer-checkout.local' }),
    );

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mock.customer.updateMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 4: welcomeEmailSentAt already set
  it('returns early when welcomeEmailSentAt is already set', async () => {
    mock.customer.findUnique.mockResolvedValue(
      registeredCustomerForWelcome({ welcomeEmailSentAt: new Date('2026-01-01T12:00:00Z') }),
    );

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mock.customer.updateMany).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Test 5: happy path
  it('acquires claim and sends email on happy path', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    // First updateMany = claim (count: 1), second = mark sent (count: 1)
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    // Resend was called once
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cliente@ejemplo.com' }),
    );

    // updateMany called twice: claim, then mark sent
    expect(mock.customer.updateMany).toHaveBeenCalledTimes(2);

    // Second call must set welcomeEmailSentAt
    const secondCall = mock.customer.updateMany.mock.calls[1][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(secondCall.data.welcomeEmailSentAt).toBeInstanceOf(Date);
    expect(secondCall.data.welcomeEmailSendingAt).toBeNull();
    expect(secondCall.where.id).toBe(CUSTOMER_ID);
    expect(secondCall.where.welcomeEmailSentAt).toBeNull();
  });

  // Test 6: claim returns count 0 — no send
  it('does not send when claim.count === 0', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    mock.customer.updateMany.mockResolvedValue({ count: 0 });

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    expect(mockSend).not.toHaveBeenCalled();
    // Only one updateMany call (the claim attempt)
    expect(mock.customer.updateMany).toHaveBeenCalledOnce();
  });

  // Test 7: releases own claim on Resend throw
  it('releases own claim on Resend failure (throw)', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })  // claim succeeds
      .mockResolvedValueOnce({ count: 1 }); // release claim
    mockSend.mockRejectedValueOnce(new Error('Resend network error'));

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    // Claim attempt + release = 2 calls
    expect(mock.customer.updateMany).toHaveBeenCalledTimes(2);

    // Release call must set welcomeEmailSendingAt: null (not set welcomeEmailSentAt)
    const releaseCall = mock.customer.updateMany.mock.calls[1][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(releaseCall.data.welcomeEmailSendingAt).toBeNull();
    expect(releaseCall.data).not.toHaveProperty('welcomeEmailSentAt');
  });

  // Test 8: method does not throw on Resend failure
  it('does not throw on Resend failure', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockSend.mockRejectedValueOnce(new Error('Resend down'));

    await expect(service.sendWelcomeEmailIfNeeded(CUSTOMER_ID)).resolves.not.toThrow();
  });

  // Test 9: concurrent — second call cannot acquire claim
  it('concurrent: second call cannot acquire claim when first holds it', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    // First call wins the claim, second gets count: 0
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })  // first call — claim
      .mockResolvedValueOnce({ count: 1 })  // first call — mark sent
      .mockResolvedValueOnce({ count: 0 }); // second call — claim fails

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);
    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    // Resend called only once
    expect(mockSend).toHaveBeenCalledOnce();
  });

  // Test 10: ownership — success-marking updateMany returns 0 (T2 holds newer claim)
  it('does not set welcomeEmailSentAt when success-marking updateMany returns 0', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })  // claim
      .mockResolvedValueOnce({ count: 0 }); // mark-sent: another process holds claim

    await service.sendWelcomeEmailIfNeeded(CUSTOMER_ID);

    // The second updateMany (mark-sent) was called but returned 0 — no error thrown
    expect(mock.customer.updateMany).toHaveBeenCalledTimes(2);
    // Verify the second call was the mark-sent call (has welcomeEmailSentAt in data)
    const markSentCall = mock.customer.updateMany.mock.calls[1][0] as {
      data: Record<string, unknown>;
    };
    expect(markSentCall.data).toHaveProperty('welcomeEmailSentAt');
  });

  // Resend error object in response body
  it('releases claim when Resend returns error object in response body', async () => {
    mock.customer.findUnique.mockResolvedValue(registeredCustomerForWelcome());
    mock.customer.updateMany
      .mockResolvedValueOnce({ count: 1 })  // claim
      .mockResolvedValueOnce({ count: 1 }); // release
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid from address' },
    });

    await expect(service.sendWelcomeEmailIfNeeded(CUSTOMER_ID)).resolves.toBeUndefined();

    // Claim + release = 2 calls, but NOT a mark-sent call
    expect(mock.customer.updateMany).toHaveBeenCalledTimes(2);
    const releaseCall = mock.customer.updateMany.mock.calls[1][0] as {
      data: Record<string, unknown>;
    };
    expect(releaseCall.data.welcomeEmailSendingAt).toBeNull();
    expect(releaseCall.data).not.toHaveProperty('welcomeEmailSentAt');
  });
});
