import { describe, expect, it } from 'vitest';
import { renderOrderConfirmation } from '@morer/emails';

// ─── Phase 10A: order_confirmation template rendering ─────────────────────────
//
// These tests exercise the React Email template directly — no EmailService,
// no Resend, no network. The render function is synchronous (v0.0.12) so no
// fake timers or async infrastructure is required.

describe('renderOrderConfirmation template', () => {
  // Test 1: render with a valid order
  it('returns a non-empty HTML string containing the order number', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-TEST-001',
      items: [
        { productName: 'Camiseta', variantSize: 'M', quantity: 1, priceInCents: 2999 },
      ],
      totalInCents: 2999,
      currency: 'EUR',
    });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('MORER-TEST-001');
    expect(html).toContain('Camiseta');
    // Basic HTML structure from @react-email/components
    expect(html.toLowerCase()).toContain('<html');
    expect(html.toLowerCase()).toContain('<body');
  });

  // Test 7: prices, quantities, sizes and total are rendered correctly
  it('renders correct product names, sizes, quantities, unit prices and order total', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-TEST-002',
      items: [
        { productName: 'Pantalón', variantSize: 'L', quantity: 2, priceInCents: 4900 },
        { productName: 'Calcetines', variantSize: 'S', quantity: 3, priceInCents: 800 },
      ],
      totalInCents: 12200,
      currency: 'EUR',
    });

    // Product names
    expect(html).toContain('Pantalón');
    expect(html).toContain('Calcetines');

    // Sizes
    expect(html).toContain('L');
    expect(html).toContain('S');

    // Quantities
    expect(html).toContain('2');
    expect(html).toContain('3');

    // Unit prices: 49,00 € and 8,00 € — check for the numeric parts
    expect(html).toContain('49');
    expect(html).toContain('8,00');

    // Total: 122,00 €
    expect(html).toContain('122');
  });

  it('includes a preview text containing the order number', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-PRV-003',
      items: [],
      totalInCents: 0,
      currency: 'EUR',
    });

    // The <Preview> component renders as a hidden span inside the HTML.
    expect(html).toContain('MORER-PRV-003');
  });
});
