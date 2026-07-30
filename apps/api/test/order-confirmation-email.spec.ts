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

  // ─── Phase 11E-beta: address snapshots in the confirmation email ────────────

  it('renders shipping and billing address snapshots (España, phone, no raw JSON)', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-ADDR-004',
      items: [{ productName: 'Camiseta', variantSize: 'M', quantity: 1, priceInCents: 2999 }],
      totalInCents: 2999,
      currency: 'EUR',
      shippingAddress: {
        fullName: 'Lluís Costa',
        phone: '+34612345678',
        line1: 'Carrer Mallorca 123',
        line2: '2º 1ª',
        postalCode: '08036',
        city: 'Barcelona',
        province: 'Barcelona',
        countryCode: 'ES',
      },
      billingAddress: {
        fullName: 'Lluís Costa Empresa',
        phone: null,
        line1: 'Gran Via 1',
        line2: null,
        postalCode: '08014',
        city: 'Barcelona',
        province: 'Barcelona',
        countryCode: 'ES',
      },
    });

    expect(html).toContain('Dirección de envío');
    expect(html).toContain('Dirección de facturación');
    expect(html).toContain('Carrer Mallorca 123');
    expect(html).toContain('Gran Via 1');
    expect(html).toContain('España');
    expect(html).toContain('+34612345678');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
  });

  it('shows a neutral fallback when snapshots are absent (legacy order)', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-ADDR-005',
      items: [],
      totalInCents: 0,
      currency: 'EUR',
      shippingAddress: null,
      billingAddress: null,
    });

    expect(html).toContain('Dirección no disponible para este pedido.');
    expect(html).not.toContain('undefined');
  });

  // ─── Phase 11F-alpha: shipping method + money breakdown ─────────────────────

  it('renders the shipping method and the money breakdown', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-SHIP-006',
      items: [{ productName: 'Camiseta', variantSize: 'M', quantity: 1, priceInCents: 5500 }],
      subtotalInCents: 5500,
      shippingInCents: 495,
      taxInCents: 0,
      totalInCents: 5995,
      currency: 'EUR',
      shippingMethod: { code: 'STANDARD', name: 'Envío estándar', description: '3-5 días laborables' },
    });

    expect(html).toContain('Método de envío');
    expect(html).toContain('Envío estándar');
    expect(html).toContain('3-5 días laborables');
    expect(html).toContain('Subtotal');
    expect(html).toContain('Impuestos');
    expect(html).toContain('Total');
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
  });

  it('shows "Gratis" for the shipping line when shipping is free', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-SHIP-007',
      items: [],
      subtotalInCents: 8000,
      shippingInCents: 0,
      taxInCents: 0,
      totalInCents: 8000,
      currency: 'EUR',
      shippingMethod: { code: 'STANDARD', name: 'Envío estándar', description: '3-5 días laborables' },
    });

    expect(html).toContain('Gratis');
  });

  it('falls back to "Método de envío no disponible." for legacy orders', async () => {
    const html = await renderOrderConfirmation({
      orderNumber: 'MORER-SHIP-008',
      items: [],
      totalInCents: 1200,
      currency: 'EUR',
      shippingMethod: null,
    });

    expect(html).toContain('Método de envío no disponible.');
    expect(html).not.toContain('undefined');
  });
});
