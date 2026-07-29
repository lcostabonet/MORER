/**
 * Phase 11E-beta: OrderAddressBlock renders snapshot lines or a neutral fallback.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OrderAddressBlock } from '@/app/checkout/orders/[orderId]/_components/OrderAddressBlock';
import type { OrderAddressSnapshot } from '@/types/order';

function snapshot(over: Partial<OrderAddressSnapshot> = {}): OrderAddressSnapshot {
  return {
    fullName: 'Lluís Costa',
    phone: '+34612345678',
    line1: 'Carrer Mallorca 123',
    line2: '2º 1ª',
    postalCode: '08036',
    city: 'Barcelona',
    province: 'Barcelona',
    countryCode: 'ES',
    ...over,
  };
}

describe('OrderAddressBlock', () => {
  it('renders the block title', () => {
    render(<OrderAddressBlock title="Dirección de envío" address={snapshot()} />);
    expect(screen.getByText('Dirección de envío')).toBeInTheDocument();
  });

  it('renders the address on clean lines with España and phone', () => {
    const { container } = render(
      <OrderAddressBlock title="Dirección de facturación" address={snapshot()} />,
    );
    expect(screen.getByText('Lluís Costa')).toBeInTheDocument();
    expect(screen.getByText('08036 Barcelona, Barcelona')).toBeInTheDocument();
    expect(screen.getByText('España')).toBeInTheDocument();
    expect(screen.getByText('+34612345678')).toBeInTheDocument();
    // Uses a semantic <address> element.
    expect(container.querySelector('address')).not.toBeNull();
  });

  it('omits line2 when it is null', () => {
    render(<OrderAddressBlock title="Dirección de envío" address={snapshot({ line2: null })} />);
    expect(screen.queryByText('2º 1ª')).not.toBeInTheDocument();
  });

  it('shows the neutral fallback for a null snapshot (legacy order)', () => {
    render(<OrderAddressBlock title="Dirección de envío" address={null} />);
    expect(screen.getByText('Dirección no disponible para este pedido.')).toBeInTheDocument();
  });

  it('never renders raw JSON, [object Object] or undefined', () => {
    const { container } = render(
      <OrderAddressBlock title="Dirección de envío" address={snapshot({ phone: null, line2: null })} />,
    );
    expect(container.textContent).not.toMatch(/\[object Object\]|undefined|null|"line1"/);
  });
});
