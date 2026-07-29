// Phase 11E-beta: shared, framework-free normalizer for the immutable address
// snapshots stored on an Order (shippingAddressSnapshot / billingAddressSnapshot).
//
// The snapshot is a fixed JSON copy written at order time (Phase 11E-alpha). It is
// intentionally decoupled from CustomerAddress: editing or deleting the source
// address never changes what a past order shows.
//
// This helper reads a raw JSON value (Prisma.JsonValue) and returns a clean,
// display-safe projection that exposes ONLY the postal fields — never addressId,
// type, customerId or any other internal field a snapshot might carry. A missing
// or malformed snapshot (e.g. a legacy order) returns null, so callers render a
// neutral fallback instead of `null`/`undefined`/`[object Object]`.

export interface OrderAddressSnapshot {
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
}

function asRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Projects a raw order address snapshot onto the safe display shape.
 * Returns null when the value is absent or does not carry the required postal
 * fields. Extra fields (addressId, type, customerId, …) are silently dropped.
 */
export function normalizeOrderAddressSnapshot(value: unknown): OrderAddressSnapshot | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;

  const fullName = asRequiredString(raw.fullName);
  const line1 = asRequiredString(raw.line1);
  const postalCode = asRequiredString(raw.postalCode);
  const city = asRequiredString(raw.city);
  const province = asRequiredString(raw.province);
  const countryCode = asRequiredString(raw.countryCode);

  // Required postal fields must all be present for the snapshot to be usable.
  if (!fullName || !line1 || !postalCode || !city || !province || !countryCode) {
    return null;
  }

  return {
    fullName,
    phone: asOptionalString(raw.phone),
    line1,
    line2: asOptionalString(raw.line2),
    postalCode,
    city,
    province,
    countryCode,
  };
}
