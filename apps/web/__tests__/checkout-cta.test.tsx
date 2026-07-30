/**
 * Phase 11F-alpha fix: the cart CTA routes to the registered checkout.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const mockPush = vi.fn();
// Stable router object so identity is constant across renders.
const mockRouter = { push: mockPush, replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

import { CheckoutCta } from '@/components/checkout-cta';

describe('CheckoutCta', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it('routes an authenticated user to /checkout', async () => {
    const user = userEvent.setup();
    render(<CheckoutCta isAuthenticated={true} />);
    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));
    expect(mockPush).toHaveBeenCalledWith('/checkout');
  });

  it('routes an anonymous user to /login?next=/checkout', async () => {
    const user = userEvent.setup();
    render(<CheckoutCta isAuthenticated={false} />);
    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));
    expect(mockPush).toHaveBeenCalledWith('/login?next=/checkout');
  });

  it('never routes a logged-in user into the legacy guest flow', async () => {
    const user = userEvent.setup();
    render(<CheckoutCta isAuthenticated={true} />);
    await user.click(screen.getByRole('button', { name: /finalizar compra/i }));
    // Only /checkout — never the guest order route nor the login page.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/checkout');
  });

  it('does not render the legacy guest email field', () => {
    render(<CheckoutCta isAuthenticated={true} />);
    expect(screen.queryByText(/email para consultar tu pedido/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('shows a login hint only for anonymous users', () => {
    const { rerender } = render(<CheckoutCta isAuthenticated={false} />);
    expect(screen.getByText(/inicia sesión para completar tu compra/i)).toBeInTheDocument();
    rerender(<CheckoutCta isAuthenticated={true} />);
    expect(screen.queryByText(/inicia sesión para completar tu compra/i)).not.toBeInTheDocument();
  });
});
