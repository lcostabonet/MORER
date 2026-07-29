/**
 * Phase 11E-beta: order address snapshot formatting helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  ADDRESS_UNAVAILABLE,
  formatOrderAddressLines,
  formatOrderAddressSummary,
} from '@/lib/order-address';
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

describe('formatOrderAddressLines', () => {
  it('produces clean postal lines in order', () => {
    expect(formatOrderAddressLines(snapshot())).toEqual([
      'Lluís Costa',
      'Carrer Mallorca 123',
      '2º 1ª',
      '08036 Barcelona, Barcelona',
      'España',
      '+34612345678',
    ]);
  });

  it('renders countryCode ES as España', () => {
    expect(formatOrderAddressLines(snapshot())).toContain('España');
  });

  it('omits line2 when it is null', () => {
    const lines = formatOrderAddressLines(snapshot({ line2: null }));
    expect(lines).not.toContain('2º 1ª');
    expect(lines).toEqual([
      'Lluís Costa',
      'Carrer Mallorca 123',
      '08036 Barcelona, Barcelona',
      'España',
      '+34612345678',
    ]);
  });

  it('omits phone when it is null', () => {
    const lines = formatOrderAddressLines(snapshot({ phone: null }));
    expect(lines).not.toContain('+34612345678');
  });

  it('never emits null, undefined or [object Object]', () => {
    const joined = formatOrderAddressLines(snapshot({ phone: null, line2: null })).join('\n');
    expect(joined).not.toMatch(/null|undefined|\[object Object\]/);
  });

  it('returns an empty list for a missing snapshot', () => {
    expect(formatOrderAddressLines(null)).toEqual([]);
    expect(formatOrderAddressLines(undefined)).toEqual([]);
  });
});

describe('formatOrderAddressSummary', () => {
  it('produces a short summary line', () => {
    expect(formatOrderAddressSummary(snapshot())).toBe('Envío a: 08036 Barcelona, Barcelona');
  });

  it('falls back to the neutral message when the snapshot is missing', () => {
    expect(formatOrderAddressSummary(null)).toBe(ADDRESS_UNAVAILABLE);
  });
});
