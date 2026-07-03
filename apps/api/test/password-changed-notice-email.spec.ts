import { describe, expect, it } from 'vitest';
import {
  renderPasswordChangedNotice,
  PASSWORD_CHANGED_NOTICE_SUBJECT,
} from '@morer/emails';

// ─── Phase 11C-gamma: password-changed notice template ────────────────────────

describe('renderPasswordChangedNotice template', () => {
  it('has the correct subject constant', () => {
    expect(PASSWORD_CHANGED_NOTICE_SUBJECT).toBe(
      'La contraseña de tu cuenta MORER ha cambiado',
    );
  });

  it('renders valid, non-trivial HTML', async () => {
    const html = await renderPasswordChangedNotice();
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html.toLowerCase()).toContain('<html');
    expect(html.toLowerCase()).toContain('<body');
  });

  it('states that the password changed', async () => {
    const html = await renderPasswordChangedNotice();
    expect(html.toLowerCase()).toContain('contraseña');
  });

  it('mentions that all sessions were closed and the user must sign in again', async () => {
    const html = await renderPasswordChangedNotice();
    expect(html.toLowerCase()).toContain('sesiones');
    expect(html.toLowerCase()).toContain('iniciar sesión');
  });

  it('includes a security warning to contact MORER if unrecognized', async () => {
    const html = await renderPasswordChangedNotice();
    expect(html.toLowerCase()).toContain('contacto');
  });

  it('leaks no secrets and no login link/token', async () => {
    const html = await renderPasswordChangedNotice();
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('$2b$');
    expect(html).not.toContain('token=');
    expect(html).not.toContain('href=');
    expect(/\b[0-9a-f]{64}\b/.test(html)).toBe(false);
    expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(html)).toBe(false);
    // No JWT-shaped string.
    expect(/eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(html)).toBe(false);
  });

  it('includes the MORER brand name', async () => {
    const html = await renderPasswordChangedNotice();
    expect(html).toContain('MORER');
  });
});
