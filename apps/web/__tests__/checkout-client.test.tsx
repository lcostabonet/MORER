/**
 * Component tests for Phase 11E-alpha CheckoutClient.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
// Stable router object (Next's useRouter is stable across renders) so the
// mount effect runs once instead of re-firing on every render.
const mockRouter = { push: mockPush, replace: mockReplace, refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

const mockGetCart = vi.fn();
vi.mock('@/lib/cart-api', () => ({
  getCartBySession: (...args: unknown[]) => mockGetCart(...args),
}));

const mockClearSession = vi.fn();
vi.mock('@/lib/session', () => ({
  getOrCreateSessionId: () => 'sess-1',
  clearSessionId: () => mockClearSession(),
}));

const CART = { id: 'cart-1', items: [{ id: 'i1' }], subtotalInCents: 1000 };

function shipAddr(over: Record<string, unknown> = {}) {
  return {
    id: 'ship-1', type: 'SHIPPING', fullName: 'Ana Envío', phone: null,
    line1: 'Calle Mayor 1', line2: null, postalCode: '28001', city: 'Madrid',
    province: 'Madrid', countryCode: 'ES', isDefaultShipping: true, isDefaultBilling: false,
    ...over,
  };
}
function billAddr(over: Record<string, unknown> = {}) {
  return {
    id: 'bill-1', type: 'BILLING', fullName: 'Ana Factura', phone: null,
    line1: 'Gran Vía 2', line2: null, postalCode: '28013', city: 'Madrid',
    province: 'Madrid', countryCode: 'ES', isDefaultShipping: false, isDefaultBilling: true,
    ...over,
  };
}

function checkoutState(over: Record<string, unknown> = {}) {
  return {
    shippingAddresses: [shipAddr()],
    billingAddresses: [billAddr()],
    defaultShippingId: 'ship-1',
    defaultBillingId: 'bill-1',
    ...over,
  };
}

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function renderClient() {
  const { CheckoutClient } = await import('@/app/checkout/_components/CheckoutClient');
  return render(React.createElement(CheckoutClient));
}

describe('CheckoutClient', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockReplace.mockReset();
    mockGetCart.mockReset();
    mockClearSession.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('shows the empty-cart state when there is no cart', async () => {
    mockGetCart.mockResolvedValue(null);
    await renderClient();
    expect(await screen.findByText('Tu carrito está vacío.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a link to /account when there are no shipping addresses', async () => {
    mockGetCart.mockResolvedValue(CART);
    vi.mocked(fetch).mockResolvedValueOnce(
      res(200, { shippingAddresses: [], billingAddresses: [], defaultShippingId: null, defaultBillingId: null }),
    );
    await renderClient();
    expect(await screen.findByText(/no tienes ninguna dirección de envío guardada/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /añadir dirección en mi cuenta/i });
    expect(link).toHaveAttribute('href', '/account');
  });

  it('redirects to login when the checkout API returns 401', async () => {
    mockGetCart.mockResolvedValue(CART);
    vi.mocked(fetch).mockResolvedValueOnce(res(401, { error: 'x' }));
    await renderClient();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?next=/checkout'));
  });

  it('preselects defaults and finalizes with the separate billing address', async () => {
    mockGetCart.mockResolvedValue(CART);
    vi.mocked(fetch)
      .mockResolvedValueOnce(res(200, checkoutState()))
      .mockResolvedValueOnce(res(201, { id: 'order-1' }));

    await renderClient();
    await screen.findByText(/dirección de envío/i);

    // The shipping and billing defaults are selected.
    expect(screen.getByRole('radio', { name: /ana envío/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /ana factura/i })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/checkout/orders/order-1'));
    expect(mockClearSession).toHaveBeenCalled();

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/checkout/orders');
    const sent = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(sent.cartId).toBe('cart-1');
    expect(sent.shippingAddressId).toBe('ship-1');
    expect(sent.billingAddressId).toBe('bill-1');
    expect(sent.useShippingAsBilling).toBe(false);
  });

  it('offers "use same for billing" only when the shipping address is BOTH', async () => {
    mockGetCart.mockResolvedValue(CART);
    // Not BOTH → checkbox absent.
    vi.mocked(fetch).mockResolvedValueOnce(res(200, checkoutState()));
    await renderClient();
    await screen.findByText(/dirección de envío/i);
    expect(
      screen.queryByRole('checkbox', { name: /usar la misma dirección para facturación/i }),
    ).not.toBeInTheDocument();
  });

  it('uses the shipping address as billing when it is BOTH (no separate billing sent)', async () => {
    mockGetCart.mockResolvedValue(CART);
    const both = shipAddr({ id: 'both-1', type: 'BOTH', fullName: 'Ana Ambas', isDefaultShipping: true });
    vi.mocked(fetch)
      .mockResolvedValueOnce(res(200, {
        shippingAddresses: [both],
        billingAddresses: [both],
        defaultShippingId: 'both-1',
        defaultBillingId: null,
      }))
      .mockResolvedValueOnce(res(201, { id: 'order-2' }));

    await renderClient();
    await screen.findByText(/dirección de envío/i);

    // With a BOTH shipping and no default billing, "use same" is preselected.
    const checkbox = screen.getByRole('checkbox', { name: /usar la misma dirección para facturación/i });
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/checkout/orders/order-2'));

    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    const sent = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(sent.useShippingAsBilling).toBe(true);
    expect(sent).not.toHaveProperty('billingAddressId');
  });

  it('shows an accessible error and does not redirect when the order fails', async () => {
    mockGetCart.mockResolvedValue(CART);
    vi.mocked(fetch)
      .mockResolvedValueOnce(res(200, checkoutState()))
      .mockResolvedValueOnce(res(400, { error: 'La dirección de envío seleccionada no es válida.' }));

    await renderClient();
    await screen.findByText(/dirección de envío/i);
    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));

    expect(await screen.findByText(/la dirección de envío seleccionada no es válida/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
