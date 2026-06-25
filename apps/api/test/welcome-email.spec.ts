import { describe, expect, it } from 'vitest';
import { renderWelcome } from '@morer/emails';

// ─── Phase 10B-beta: welcome template rendering ───────────────────────────────
//
// These tests exercise the WelcomeEmail React Email template directly — no
// EmailService, no Resend, no network. The render function is async but
// contains no I/O; @react-email/render works entirely in memory.

describe('renderWelcome template', () => {
  it('renders WelcomeEmail to HTML without throwing', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html.toLowerCase()).toContain('<html');
    expect(html.toLowerCase()).toContain('<body');
  });

  it('output includes MORER', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    expect(html).toContain('MORER');
  });

  it('output includes firstName when firstName is provided', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    expect(html).toContain('Joan');
    expect(html).toContain('Hola, Joan');
  });

  it('output uses fallback greeting when firstName is null', async () => {
    const html = await renderWelcome({
      firstName: null,
      webUrl: 'https://morer.com',
    });

    expect(html).toContain('Hola');
    // Must NOT include the comma-name form
    expect(html).not.toContain('Hola, ');
  });

  it('output uses fallback greeting when firstName is undefined', async () => {
    const html = await renderWelcome({
      webUrl: 'https://morer.com',
    });

    expect(html).toContain('Hola');
    expect(html).not.toContain('Hola, ');
  });

  it('output includes CTA link containing webUrl', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    // The template renders <Link href={`${webUrl}/shop`}>
    expect(html).toContain('https://morer.com/shop');
  });

  it('output does not contain "password" or "passwordHash" or "JWT"', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    const lower = html.toLowerCase();
    expect(lower).not.toContain('password');
    expect(lower).not.toContain('jwt');
  });

  it('output does not contain invented discount text', async () => {
    const html = await renderWelcome({
      firstName: 'Joan',
      webUrl: 'https://morer.com',
    });

    const lower = html.toLowerCase();
    expect(lower).not.toContain('descuento');
    expect(lower).not.toContain('oferta');
    expect(lower).not.toContain('promo');
    expect(lower).not.toContain('discount');
  });
});
