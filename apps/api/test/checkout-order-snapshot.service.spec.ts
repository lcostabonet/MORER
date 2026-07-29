import { beforeEach, describe, expect, it } from 'vitest';
import { CheckoutService } from '../src/checkout/checkout.service';
import { normalizeOrderAddressSnapshot } from '../src/checkout/order-address-snapshot';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';
import type { PrismaMock } from './helpers/prisma-mock';

// Phase 11E-beta: findOrder must expose the immutable address snapshots, tolerate
// legacy null snapshots, and never leak internal fields (customerId/addressId).

const ORDER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const SHIPPING_SNAPSHOT = {
  fullName: 'Lluís Costa',
  phone: '+34612345678',
  line1: 'Carrer Mallorca 123',
  line2: '2º 1ª',
  postalCode: '08036',
  city: 'Barcelona',
  province: 'Barcelona',
  countryCode: 'ES',
};

const BILLING_SNAPSHOT = {
  fullName: 'Lluís Costa Empresa',
  phone: null,
  line1: 'Gran Via 1',
  line2: null,
  postalCode: '08014',
  city: 'Barcelona',
  province: 'Barcelona',
  countryCode: 'ES',
};

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: 'MORER-ABC1-XYZ2',
    status: 'PAID',
    totalInCents: 1000,
    shippingInCents: 0,
    taxInCents: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    shippingAddressSnapshot: SHIPPING_SNAPSHOT,
    billingAddressSnapshot: BILLING_SNAPSHOT,
    items: [
      { id: 'item-1', variantId: 'variant-1', productName: 'T-Shirt', variantSize: 'M', quantity: 1, priceInCents: 1000 },
    ],
    ...overrides,
  };
}

describe('CheckoutService.findOrder — address snapshots (11E-beta)', () => {
  let mock: PrismaMock;
  let service: CheckoutService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = new CheckoutService(asPrismaService(mock));
  });

  it('exposes the shipping address snapshot on the order response', async () => {
    mock.order.findUnique.mockResolvedValue(baseOrder());
    const result = await service.findOrder(ORDER_ID);
    expect(result.shippingAddress).toEqual(SHIPPING_SNAPSHOT);
  });

  it('exposes the billing address snapshot on the order response', async () => {
    mock.order.findUnique.mockResolvedValue(baseOrder());
    const result = await service.findOrder(ORDER_ID);
    expect(result.billingAddress).toEqual(BILLING_SNAPSHOT);
  });

  it('returns null snapshots for a legacy order without them (no throw)', async () => {
    mock.order.findUnique.mockResolvedValue(
      baseOrder({ shippingAddressSnapshot: null, billingAddressSnapshot: null }),
    );
    const result = await service.findOrder(ORDER_ID);
    expect(result.shippingAddress).toBeNull();
    expect(result.billingAddress).toBeNull();
  });

  it('drops internal/extra fields (addressId, type, customerId) from the snapshot', async () => {
    mock.order.findUnique.mockResolvedValue(
      baseOrder({
        shippingAddressSnapshot: {
          ...SHIPPING_SNAPSHOT,
          addressId: 'addr-secret',
          type: 'SHIPPING',
          customerId: 'customer-secret',
        },
      }),
    );
    const result = await service.findOrder(ORDER_ID);
    expect(result.shippingAddress).toEqual(SHIPPING_SNAPSHOT);
    expect(result.shippingAddress).not.toHaveProperty('addressId');
    expect(result.shippingAddress).not.toHaveProperty('type');
    expect(result.shippingAddress).not.toHaveProperty('customerId');
  });

  it('never leaks customerId on the order response itself', async () => {
    mock.order.findUnique.mockResolvedValue(baseOrder({ customerId: 'customer-secret' }));
    const result = await service.findOrder(ORDER_ID);
    expect(result).not.toHaveProperty('customerId');
  });

  it('treats a malformed snapshot (missing required fields) as unavailable', async () => {
    mock.order.findUnique.mockResolvedValue(
      baseOrder({ shippingAddressSnapshot: { fullName: 'Only a name' } }),
    );
    const result = await service.findOrder(ORDER_ID);
    expect(result.shippingAddress).toBeNull();
  });
});

describe('normalizeOrderAddressSnapshot (11E-beta)', () => {
  it('returns null for null / non-object / array inputs', () => {
    expect(normalizeOrderAddressSnapshot(null)).toBeNull();
    expect(normalizeOrderAddressSnapshot(undefined)).toBeNull();
    expect(normalizeOrderAddressSnapshot('x')).toBeNull();
    expect(normalizeOrderAddressSnapshot(42)).toBeNull();
    expect(normalizeOrderAddressSnapshot([])).toBeNull();
  });

  it('normalizes a full snapshot and preserves nullable optional fields', () => {
    expect(normalizeOrderAddressSnapshot(BILLING_SNAPSHOT)).toEqual(BILLING_SNAPSHOT);
  });

  it('coerces missing optional fields (phone/line2) to null', () => {
    const { phone: _p, line2: _l, ...withoutOptionals } = SHIPPING_SNAPSHOT;
    const result = normalizeOrderAddressSnapshot(withoutOptionals);
    expect(result?.phone).toBeNull();
    expect(result?.line2).toBeNull();
  });

  it('does not mutate the input snapshot', () => {
    const input = { ...SHIPPING_SNAPSHOT, addressId: 'x' };
    const snapshot = JSON.stringify(input);
    normalizeOrderAddressSnapshot(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
