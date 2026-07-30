import { BadRequestException } from '@nestjs/common';

// Phase 11F-alpha: shipping methods for the authenticated checkout.
//
// The backend is the single source of truth for shipping cost and totals. The
// frontend may display methods but never sends prices — only a method code, which
// the backend re-prices against the real cart subtotal.
//
// Business rules (Spain only, no tax this phase):
//   STANDARD  495 cents, or FREE when subtotal >= 7500 cents (75,00 €)
//   EXPRESS   895 cents, always paid
//   taxInCents = 0

export const SHIPPING_METHOD_CODES = ['STANDARD', 'EXPRESS'] as const;
export type ShippingMethodCode = (typeof SHIPPING_METHOD_CODES)[number];

export const FREE_STANDARD_SHIPPING_THRESHOLD_CENTS = 7500;
const STANDARD_BASE_CENTS = 495;
const EXPRESS_CENTS = 895;

export const SHIPPING_ONLY_SPAIN =
  'Por ahora solo se admiten envíos a España.';
export const INVALID_SHIPPING_METHOD =
  'El método de envío seleccionado no es válido.';

// Fixed definitions. name/description are snapshotted onto the order so past
// orders keep their original labels even if these definitions change later.
interface ShippingMethodDefinition {
  code: ShippingMethodCode;
  name: string;
  description: string;
  baseCents: number;
  freeFromCents: number | null; // subtotal threshold for free shipping, or null
}

const DEFINITIONS: Record<ShippingMethodCode, ShippingMethodDefinition> = {
  STANDARD: {
    code: 'STANDARD',
    name: 'Envío estándar',
    description: '3-5 días laborables',
    baseCents: STANDARD_BASE_CENTS,
    freeFromCents: FREE_STANDARD_SHIPPING_THRESHOLD_CENTS,
  },
  EXPRESS: {
    code: 'EXPRESS',
    name: 'Envío express',
    description: '1-2 días laborables',
    baseCents: EXPRESS_CENTS,
    freeFromCents: null,
  },
};

export const DEFAULT_SHIPPING_METHOD_CODE: ShippingMethodCode = 'STANDARD';

// A priced method as shown to the UI / resolved for an order.
export interface ShippingMethodOption {
  code: ShippingMethodCode;
  name: string;
  description: string;
  priceInCents: number;
}

export function isShippingMethodCode(value: unknown): value is ShippingMethodCode {
  return typeof value === 'string' && (SHIPPING_METHOD_CODES as readonly string[]).includes(value);
}

function priceFor(def: ShippingMethodDefinition, subtotalInCents: number): number {
  if (def.freeFromCents !== null && subtotalInCents >= def.freeFromCents) {
    return 0;
  }
  return def.baseCents;
}

/**
 * All available shipping methods, priced against the given cart subtotal.
 * Order is stable (STANDARD first) so the UI can rely on it.
 */
export function getAvailableShippingMethods(subtotalInCents: number): ShippingMethodOption[] {
  return SHIPPING_METHOD_CODES.map((code) => {
    const def = DEFINITIONS[code];
    return {
      code: def.code,
      name: def.name,
      description: def.description,
      priceInCents: priceFor(def, subtotalInCents),
    };
  });
}

/**
 * Resolves a single method by code, priced against the real cart subtotal.
 * Throws a controlled BadRequestException for an unknown code — never trusts a
 * client-supplied price.
 */
export function resolveShippingMethod(
  code: string,
  subtotalInCents: number,
): ShippingMethodOption {
  if (!isShippingMethodCode(code)) {
    throw new BadRequestException(INVALID_SHIPPING_METHOD);
  }
  const def = DEFINITIONS[code];
  return {
    code: def.code,
    name: def.name,
    description: def.description,
    priceInCents: priceFor(def, subtotalInCents),
  };
}
