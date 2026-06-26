import { describe, expect, it } from 'vitest';
import { renderPasswordReset } from '@morer/emails';

// ─── Phase 11B-alpha: password-reset template rendering ───────────────────────
//
// These tests exercise the PasswordResetEmail React Email template directly —
// no EmailService, no Resend, no network. The render function is async but
// contains no I/O; @react-email/render works entirely in memory.
//
// Pattern follows welcome-email.spec.ts.

describe('renderPasswordReset template', () => {
  it('renders without error with firstName and resetUrl', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html.toLowerCase()).toContain('<html');
    expect(html.toLowerCase()).toContain('<body');
  });

  it('includes firstName in greeting when provided', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(html).toContain('Joan');
    expect(html).toContain('Hola, Joan');
  });

  it('uses fallback greeting when firstName is null', async () => {
    const html = await renderPasswordReset({
      firstName: null,
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(html).toContain('Hola');
    // Must NOT include the comma-name form
    expect(html).not.toContain('Hola, ');
  });

  it('uses fallback greeting when firstName is undefined', async () => {
    const html = await renderPasswordReset({
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(html).toContain('Hola');
    expect(html).not.toContain('Hola, ');
  });

  it('includes resetUrl in output (CTA link)', async () => {
    const resetUrl = 'https://morer.com/reset-password?token=abc123def456';

    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl,
    });

    expect(html).toContain(resetUrl);
  });

  it('mentions 30 minutes (link expiry notice)', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(html).toContain('30');
  });

  it('includes ignore notice for users who did not request a reset', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    // Template text: "Si no solicitaste este cambio, puedes ignorar este correo"
    const lower = html.toLowerCase();
    expect(lower).toContain('ignorar');
  });

  it('does not contain any literal password value or passwordHash pattern', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    // The email must not accidentally expose credential data
    expect(html).not.toContain('passwordHash');
    // A bcrypt hash prefix would indicate accidental data leakage
    expect(html).not.toContain('$2b$');
  });

  it('does not contain a 64-char hex pattern (raw tokenHash must not appear)', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    // A SHA-256 hex digest is 64 lowercase hex chars — should never appear in the email
    const hexPattern = /\b[0-9a-f]{64}\b/;
    expect(hexPattern.test(html)).toBe(false);
  });

  it('does not contain internal IDs (UUID-shaped strings in body text)', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    // A UUID such as a customerId or tokenId must not appear in the rendered output
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuidPattern.test(html)).toBe(false);
  });

  it('output includes MORER brand name', async () => {
    const html = await renderPasswordReset({
      firstName: 'Joan',
      resetUrl: 'https://morer.com/reset-password?token=abc123',
    });

    expect(html).toContain('MORER');
  });
});
