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
