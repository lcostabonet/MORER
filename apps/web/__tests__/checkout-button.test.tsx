/**
 * Guards the legacy guest checkout: the CheckoutButton component (guest email
 * flow) must remain intact and functional — not deleted or broken by the cart
 * CTA change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

const mockStartCheckout = vi.fn();
vi.mock('@/lib/checkout-api', () => ({
  startCheckout: (...args: unknown[]) => mockStartCheckout(...args),
}));

import { CheckoutButton } from '@/components/checkout-button';

describe('CheckoutButton (legacy guest flow — still intact)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockStartCheckout.mockReset();
  });

  it('still renders the legacy guest email form', () => {
    render(<CheckoutButton cartId="cart-1" />);
    expect(screen.getByLabelText(/email para consultar tu pedido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finalizar compra/i })).toBeInTheDocument();
  });

  it('still starts a guest checkout and navigates to the order', async () => {
    const user = userEvent.setup();
    mockStartCheckout.mockResolvedValue({ id: 'order-guest-1' });

    render(<CheckoutButton cartId="cart-1" />);
    await user.type(screen.getByLabelText(/email para consultar tu pedido/i), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));

    await waitFor(() =>
      expect(mockStartCheckout).toHaveBeenCalledWith('cart-1', 'guest@example.com'),
    );
    expect(mockPush).toHaveBeenCalledWith('/checkout/orders/order-guest-1');
  });
});
