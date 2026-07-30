/**
 * Phase 11F-alpha: OrderShippingMethodBlock renders the method or a fallback.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OrderShippingMethodBlock } from '@/app/checkout/orders/[orderId]/_components/OrderShippingMethodBlock';

const STANDARD = { code: 'STANDARD', name: 'Envío estándar', description: '3-5 días laborables' };

describe('OrderShippingMethodBlock', () => {
  it('renders the method name, ETA and cost', () => {
    render(<OrderShippingMethodBlock method={STANDARD} shippingInCents={495} />);
    expect(screen.getByText('Método de envío')).toBeInTheDocument();
    expect(screen.getByText('Envío estándar')).toBeInTheDocument();
    expect(screen.getByText('3-5 días laborables')).toBeInTheDocument();
    expect(screen.getByText('4,95 €')).toBeInTheDocument();
  });

  it('shows "Gratis" when shipping is free', () => {
    render(<OrderShippingMethodBlock method={STANDARD} shippingInCents={0} />);
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });

  it('shows the neutral fallback for a legacy order (null method)', () => {
    render(<OrderShippingMethodBlock method={null} shippingInCents={0} />);
    expect(screen.getByText('Método de envío no disponible.')).toBeInTheDocument();
  });

  it('never renders raw JSON, [object Object] or undefined', () => {
    const { container } = render(<OrderShippingMethodBlock method={STANDARD} shippingInCents={495} />);
    expect(container.textContent).not.toMatch(/\[object Object\]|undefined|"code"/);
  });
});
