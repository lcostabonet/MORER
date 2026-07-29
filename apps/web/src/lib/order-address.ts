import type { OrderAddressSnapshot } from '@/types/order';

// Phase 11E-beta: presentation helpers for order address snapshots.
//
// Snapshots are immutable copies stored on the order; these helpers only format
// them for display. They never read the live CustomerAddress, never mutate the
// snapshot, and never render internal fields (addressId/type/customerId are not
// part of the snapshot shape and are ignored if present).

export const ADDRESS_UNAVAILABLE = 'Dirección no disponible para este pedido.';

function countryLabel(countryCode: string): string {
  return countryCode === 'ES' ? 'España' : countryCode;
}

/**
 * Clean postal layout, one entry per line. Empty/null parts are omitted so the
 * output never contains `null`, `undefined` or `[object Object]`:
 *
 *   Lluís Costa
 *   Carrer Mallorca 123
 *   2º 1ª                     (line2, only if present)
 *   08036 Barcelona, Barcelona
 *   España
 *   +34612345678              (phone, only if present)
 */
export function formatOrderAddressLines(
  snapshot: OrderAddressSnapshot | null | undefined,
): string[] {
  if (!snapshot) return [];
  return [
    snapshot.fullName,
    snapshot.line1,
    snapshot.line2,
    `${snapshot.postalCode} ${snapshot.city}, ${snapshot.province}`,
    countryLabel(snapshot.countryCode),
    snapshot.phone,
  ].filter((line): line is string => typeof line === 'string' && line.trim() !== '');
}

/**
 * Short one-line summary for compact contexts (e.g. an order-history list, if it
 * exists). Returns a neutral fallback when the snapshot is missing.
 */
export function formatOrderAddressSummary(
  snapshot: OrderAddressSnapshot | null | undefined,
): string {
  if (!snapshot) return ADDRESS_UNAVAILABLE;
  return `Envío a: ${snapshot.postalCode} ${snapshot.city}, ${snapshot.province}`;
}
