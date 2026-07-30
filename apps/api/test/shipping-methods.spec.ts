import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  FREE_STANDARD_SHIPPING_THRESHOLD_CENTS,
  getAvailableShippingMethods,
  isShippingMethodCode,
  resolveShippingMethod,
} from '../src/checkout/shipping-methods';

// Phase 11F-alpha shipping rules:
//   STANDARD 495, or 0 when subtotal >= 7500
//   EXPRESS  895 always
const BELOW = 5500; // 55,00 €
const AT = FREE_STANDARD_SHIPPING_THRESHOLD_CENTS; // 75,00 €
const ABOVE = 8000; // 80,00 €

describe('getAvailableShippingMethods', () => {
  it('returns STANDARD and EXPRESS in a stable order', () => {
    const codes = getAvailableShippingMethods(BELOW).map((m) => m.code);
    expect(codes).toEqual(['STANDARD', 'EXPRESS']);
  });

  it('prices STANDARD at 495 and EXPRESS at 895 below the free threshold', () => {
    const [standard, express] = getAvailableShippingMethods(BELOW);
    expect(standard.priceInCents).toBe(495);
    expect(express.priceInCents).toBe(895);
  });

  it('prices STANDARD free (0) at exactly the free threshold', () => {
    const [standard, express] = getAvailableShippingMethods(AT);
    expect(standard.priceInCents).toBe(0);
    expect(express.priceInCents).toBe(895); // express is never free
  });

  it('prices STANDARD free (0) above the free threshold; EXPRESS stays 895', () => {
    const [standard, express] = getAvailableShippingMethods(ABOVE);
    expect(standard.priceInCents).toBe(0);
    expect(express.priceInCents).toBe(895);
  });

  it('carries the human-readable name and ETA', () => {
    const [standard, express] = getAvailableShippingMethods(BELOW);
    expect(standard.name).toBe('Envío estándar');
    expect(standard.description).toBe('3-5 días laborables');
    expect(express.name).toBe('Envío express');
    expect(express.description).toBe('1-2 días laborables');
  });
});

describe('resolveShippingMethod', () => {
  it('resolves STANDARD to 495 below threshold', () => {
    expect(resolveShippingMethod('STANDARD', BELOW).priceInCents).toBe(495);
  });

  it('resolves STANDARD to 0 at/above threshold', () => {
    expect(resolveShippingMethod('STANDARD', AT).priceInCents).toBe(0);
    expect(resolveShippingMethod('STANDARD', ABOVE).priceInCents).toBe(0);
  });

  it('resolves EXPRESS to 895 regardless of subtotal', () => {
    expect(resolveShippingMethod('EXPRESS', BELOW).priceInCents).toBe(895);
    expect(resolveShippingMethod('EXPRESS', ABOVE).priceInCents).toBe(895);
  });

  it('throws a controlled BadRequestException for an unknown code', () => {
    expect(() => resolveShippingMethod('FREEBIE', BELOW)).toThrow(BadRequestException);
    expect(() => resolveShippingMethod('standard', BELOW)).toThrow(BadRequestException); // case-sensitive
    expect(() => resolveShippingMethod('', BELOW)).toThrow(BadRequestException);
  });
});

describe('isShippingMethodCode', () => {
  it('accepts only the exact known codes', () => {
    expect(isShippingMethodCode('STANDARD')).toBe(true);
    expect(isShippingMethodCode('EXPRESS')).toBe(true);
    expect(isShippingMethodCode('standard')).toBe(false);
    expect(isShippingMethodCode('FREE')).toBe(false);
    expect(isShippingMethodCode(undefined)).toBe(false);
    expect(isShippingMethodCode(123)).toBe(false);
  });
});
