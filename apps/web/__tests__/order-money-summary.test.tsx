/**
 * Phase 11F-alpha: OrderMoneySummary renders the backend money breakdown.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OrderMoneySummary } from '@/app/checkout/orders/[orderId]/_components/OrderMoneySummary';

describe('OrderMoneySummary', () => {
  it('renders subtotal, shipping, tax and total labels and amounts', () => {
    render(
      <OrderMoneySummary subtotalInCents={5500} shippingInCents={495} taxInCents={0} totalInCents={5995} />,
    );
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Envío')).toBeInTheDocument();
    expect(screen.getByText('Impuestos')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('55 €')).toBeInTheDocument(); // subtotal
    expect(screen.getByText('4,95 €')).toBeInTheDocument(); // shipping
    expect(screen.getByText('0 €')).toBeInTheDocument(); // tax
    expect(screen.getByText('59,95 €')).toBeInTheDocument(); // total
  });

  it('shows "Gratis" for the shipping line when shipping is free', () => {
    render(
      <OrderMoneySummary subtotalInCents={8000} shippingInCents={0} taxInCents={0} totalInCents={8000} />,
    );
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });

  it('never renders [object Object] or undefined', () => {
    const { container } = render(
      <OrderMoneySummary subtotalInCents={5500} shippingInCents={495} taxInCents={0} totalInCents={5995} />,
    );
    expect(container.textContent).not.toMatch(/\[object Object\]|undefined/);
  });
});
