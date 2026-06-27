import { describe, expect, it } from 'vitest';
import { renderVerifyEmail } from '@morer/emails';

// ─── Phase 11B-beta: verify-email template rendering ──────────────────────────
//
// These tests exercise the VerifyEmailEmail React Email template directly —
// no EmailService, no Resend, no network. The render function is async but
// contains no I/O; @react-email/render works entirely in memory.
//
// Pattern follows password-reset-email.spec.ts.

describe('renderVerifyEmail template', () => {
  it('renders without error with firstName and verifyUrl', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html.toLowerCase()).toContain('<html');
    expect(html.toLowerCase()).toContain('<body');
  });

  it('includes firstName in greeting when provided', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('Joan');
    expect(html).toContain('Hola, Joan');
  });

  it('uses fallback greeting when firstName is null', async () => {
    const html = await renderVerifyEmail({
      firstName: null,
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('Hola');
    // Must NOT include the comma-name form
    expect(html).not.toContain('Hola, ');
  });

  it('uses fallback greeting when firstName is undefined', async () => {
    const html = await renderVerifyEmail({
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('Hola');
    expect(html).not.toContain('Hola, ');
  });

  it('includes verifyUrl in output (CTA link)', async () => {
    const verifyUrl = 'https://morer.com/verify-email?token=abc123def456';

    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl,
    });

    expect(html).toContain(verifyUrl);
  });

  it('includes the "Verificar correo" CTA text', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('Verificar correo');
  });

  it('mentions 24 hours (link expiry notice)', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('24');
  });

  it('includes ignore notice for users who did not create the account', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    const lower = html.toLowerCase();
    expect(lower).toContain('ignorar');
  });

  it('does not contain any password value or passwordHash pattern', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('$2b$');
  });

  it('does not contain a 64-char hex pattern (raw tokenHash must not appear)', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    const hexPattern = /\b[0-9a-f]{64}\b/;
    expect(hexPattern.test(html)).toBe(false);
  });

  it('does not contain internal IDs (UUID-shaped strings in body text)', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(uuidPattern.test(html)).toBe(false);
  });

  it('output includes MORER brand name', async () => {
    const html = await renderVerifyEmail({
      firstName: 'Joan',
      verifyUrl: 'https://morer.com/verify-email?token=abc123',
    });

    expect(html).toContain('MORER');
  });
});
