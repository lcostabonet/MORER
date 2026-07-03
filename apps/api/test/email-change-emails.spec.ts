import { describe, expect, it } from 'vitest';
import { renderConfirmEmailChange, renderEmailChangedNotice } from '@morer/emails';

// ─── Phase 11C-beta: email-change templates ───────────────────────────────────
//
// Render the two React Email templates directly — no EmailService, no Resend,
// no network. Pattern follows verify-email-email.spec.ts.

describe('renderConfirmEmailChange template', () => {
  const confirmUrl = 'https://morer.com/confirm-email-change?token=abc123def456';

  it('renders valid HTML with the confirm URL', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html.toLowerCase()).toContain('<html');
    expect(html).toContain(confirmUrl);
  });

  it('includes the "Confirmar nuevo correo" CTA', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(html).toContain('Confirmar nuevo correo');
  });

  it('mentions the 60-minute expiry', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(html).toContain('60');
  });

  it('includes an ignore notice for unsolicited requests', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(html.toLowerCase()).toContain('ignorar');
  });

  it('leaks no secrets: no password, hash, uuid, or JWT-looking token', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('$2b$');
    expect(/\b[0-9a-f]{64}\b/.test(html)).toBe(false);
    expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html)).toBe(false);
    // A JWT has three base64url segments separated by dots.
    expect(/eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(html)).toBe(false);
  });

  it('includes the MORER brand name', async () => {
    const html = await renderConfirmEmailChange({ confirmUrl });
    expect(html).toContain('MORER');
  });
});

describe('renderEmailChangedNotice template', () => {
  it('renders valid HTML with the masked new email', async () => {
    const html = await renderEmailChangedNotice({ maskedNewEmail: 'n***@example.com' });
    expect(typeof html).toBe('string');
    expect(html.toLowerCase()).toContain('<html');
    expect(html).toContain('n***@example.com');
  });

  it('mentions that all sessions were closed', async () => {
    const html = await renderEmailChangedNotice({ maskedNewEmail: 'n***@example.com' });
    expect(html.toLowerCase()).toContain('sesiones');
  });

  it('tells the user to contact MORER if they do not recognize the change', async () => {
    const html = await renderEmailChangedNotice({ maskedNewEmail: 'n***@example.com' });
    expect(html.toLowerCase()).toContain('contacto');
  });

  it('leaks no secrets and no login link/token', async () => {
    const html = await renderEmailChangedNotice({ maskedNewEmail: 'n***@example.com' });
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('$2b$');
    expect(html).not.toContain('token=');
    expect(/\b[0-9a-f]{64}\b/.test(html)).toBe(false);
    expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html)).toBe(false);
  });

  it('includes the MORER brand name', async () => {
    const html = await renderEmailChangedNotice({ maskedNewEmail: 'n***@example.com' });
    expect(html).toContain('MORER');
  });
});
