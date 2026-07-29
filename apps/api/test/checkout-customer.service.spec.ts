import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from '../src/checkout/checkout.service';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';
import type { PrismaMock } from './helpers/prisma-mock';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CUSTOMER_ID = 'customer-1';
const CART_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EMAIL = 'Cliente@Ejemplo.com';

const VALID_CART = {
  id: CART_ID,
  status: 'ACTIVE',
  items: [
    {
      id: 'item-1',
      variantId: 'variant-1',
      quantity: 1,
      priceInCents: 1000,
      variant: {
        id: 'variant-1',
        size: 'M',
        priceInCents: 1000,
        status: 'ACTIVE',
        deletedAt: null,
        product: { name: 'T-Shirt', status: 'ACTIVE' },
        inventory: { stockQuantity: 10, reservedQuantity: 0 },
      },
    },
  ],
};

const MOCK_ORDER = {
  id: 'order-1',
  orderNumber: 'MORER-ABC1-XYZ2',
  status: 'PENDING_PAYMENT',
  totalInCents: 1000,
  shippingInCents: 0,
  taxInCents: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  items: [
    { id: 'item-1', variantId: 'variant-1', productName: 'T-Shirt', variantSize: 'M', quantity: 1, priceInCents: 1000 },
  ],
};

function ownedAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-ship',
    fullName: 'Ana García',
    phone: '+34600111222',
    line1: 'Calle Mayor 1',
    line2: null,
    postalCode: '28001',
    city: 'Madrid',
    province: 'Madrid',
    countryCode: 'ES',
    type: 'SHIPPING',
    ...overrides,
  };
}

type PrismaMockWithAddress = PrismaMock & {
  customerAddress: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

function makeMock(): PrismaMockWithAddress {
  const mock = createPrismaMock() as PrismaMockWithAddress;
  mock.customerAddress = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  return mock;
}

function wireOrderCreation(mock: PrismaMockWithAddress): void {
  mock.__tx.cart.findUnique.mockResolvedValue(VALID_CART);
  mock.__tx.inventory.update.mockResolvedValue({});
  mock.__tx.order.create.mockResolvedValue(MOCK_ORDER);
  mock.__tx.cart.update.mockResolvedValue({});
}

function orderCreateData(mock: PrismaMockWithAddress) {
  return mock.__tx.order.create.mock.calls[0][0].data as Record<string, unknown>;
}

describe('CheckoutService — authenticated customer flow (11E-alpha)', () => {
  let mock: PrismaMockWithAddress;
  let service: CheckoutService;

  beforeEach(() => {
    mock = makeMock();
    service = new CheckoutService(asPrismaService(mock));
  });

  // ── getCustomerCheckout ──────────────────────────────────────────────────────

  describe('getCustomerCheckout', () => {
    it('splits addresses by compatibility and reports the defaults', async () => {
      mock.customerAddress.findMany.mockResolvedValue([
        { id: 's', type: 'SHIPPING', isDefaultShipping: true, isDefaultBilling: false },
        { id: 'b', type: 'BILLING', isDefaultShipping: false, isDefaultBilling: true },
        { id: 'x', type: 'BOTH', isDefaultShipping: false, isDefaultBilling: false },
      ]);

      const state = await service.getCustomerCheckout(CUSTOMER_ID);

      expect(state.shippingAddresses.map((a) => a.id)).toEqual(['s', 'x']);
      expect(state.billingAddresses.map((a) => a.id)).toEqual(['b', 'x']);
      expect(state.defaultShippingId).toBe('s');
      expect(state.defaultBillingId).toBe('b');

      const args = mock.customerAddress.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ customerId: CUSTOMER_ID });
      expect(args.select).not.toHaveProperty('customerId');
    });

    it('reports null defaults when none are set', async () => {
      mock.customerAddress.findMany.mockResolvedValue([
        { id: 's', type: 'SHIPPING', isDefaultShipping: false, isDefaultBilling: false },
      ]);
      const state = await service.getCustomerCheckout(CUSTOMER_ID);
      expect(state.defaultShippingId).toBeNull();
      expect(state.defaultBillingId).toBeNull();
    });
  });

  // ── startCustomerCheckout ────────────────────────────────────────────────────

  describe('startCustomerCheckout', () => {
    const expectedShippingSnapshot = {
      fullName: 'Ana García',
      phone: '+34600111222',
      line1: 'Calle Mayor 1',
      line2: null,
      postalCode: '28001',
      city: 'Madrid',
      province: 'Madrid',
      countryCode: 'ES',
    };

    it('snapshots both addresses onto the order (separate billing)', async () => {
      wireOrderCreation(mock);
      mock.customerAddress.findFirst
        .mockResolvedValueOnce(ownedAddress({ id: 'addr-ship', type: 'SHIPPING' }))
        .mockResolvedValueOnce(
          ownedAddress({ id: 'addr-bill', type: 'BILLING', fullName: 'Ana Facturación', line1: 'Gran Vía 2' }),
        );

      await service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
        cartId: CART_ID,
        shippingAddressId: 'addr-ship',
        billingAddressId: 'addr-bill',
        useShippingAsBilling: false,
      });

      const data = orderCreateData(mock);
      expect(data.customerId).toBe(CUSTOMER_ID);
      expect(data.email).toBe('cliente@ejemplo.com'); // normalized
      expect(data.shippingAddressSnapshot).toEqual(expectedShippingSnapshot);
      expect((data.billingAddressSnapshot as Record<string, unknown>).fullName).toBe('Ana Facturación');
      expect((data.billingAddressSnapshot as Record<string, unknown>).line1).toBe('Gran Vía 2');
    });

    it('uses the shipping address for billing when it is BOTH and useShippingAsBilling', async () => {
      wireOrderCreation(mock);
      mock.customerAddress.findFirst.mockResolvedValueOnce(ownedAddress({ id: 'addr-both', type: 'BOTH' }));

      await service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
        cartId: CART_ID,
        shippingAddressId: 'addr-both',
        useShippingAsBilling: true,
      });

      const data = orderCreateData(mock);
      expect(data.billingAddressSnapshot).toEqual(data.shippingAddressSnapshot);
      // The billing address is not looked up separately.
      expect(mock.customerAddress.findFirst).toHaveBeenCalledTimes(1);
    });

    it('rejects useShippingAsBilling when the shipping address is not BOTH', async () => {
      mock.customerAddress.findFirst.mockResolvedValueOnce(ownedAddress({ type: 'SHIPPING' }));
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          useShippingAsBilling: true,
        }),
      ).rejects.toThrow('La dirección de envío seleccionada no puede usarse también para facturación.');
      expect(mock.__tx.order.create).not.toHaveBeenCalled();
    });

    it('rejects a shipping address that is not owned', async () => {
      mock.customerAddress.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'not-mine',
          billingAddressId: 'b',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('La dirección de envío seleccionada no es válida.');
      expect(mock.__tx.order.create).not.toHaveBeenCalled();
    });

    it('rejects a shipping address that is billing-only', async () => {
      mock.customerAddress.findFirst.mockResolvedValueOnce(ownedAddress({ type: 'BILLING' }));
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          billingAddressId: 'b',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('La dirección de envío seleccionada no es válida.');
    });

    it('rejects a non-ES shipping address', async () => {
      mock.customerAddress.findFirst.mockResolvedValueOnce(ownedAddress({ countryCode: 'FR' }));
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          billingAddressId: 'b',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('Por ahora solo se admiten direcciones de España.');
    });

    it('rejects a billing address that is not owned', async () => {
      mock.customerAddress.findFirst
        .mockResolvedValueOnce(ownedAddress({ type: 'SHIPPING' }))
        .mockResolvedValueOnce(null);
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          billingAddressId: 'not-mine',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('La dirección de facturación seleccionada no es válida.');
      expect(mock.__tx.order.create).not.toHaveBeenCalled();
    });

    it('rejects a billing address that is shipping-only', async () => {
      mock.customerAddress.findFirst
        .mockResolvedValueOnce(ownedAddress({ type: 'SHIPPING' }))
        .mockResolvedValueOnce(ownedAddress({ id: 'b', type: 'SHIPPING' }));
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          billingAddressId: 'b',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('La dirección de facturación seleccionada no es válida.');
    });

    it('requires a billing address when not reusing shipping', async () => {
      mock.customerAddress.findFirst.mockResolvedValueOnce(ownedAddress({ type: 'SHIPPING' }));
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: CART_ID,
          shippingAddressId: 'addr-ship',
          useShippingAsBilling: false,
        }),
      ).rejects.toThrow('La dirección de facturación seleccionada no es válida.');
    });

    it('rejects an invalid (non-UUID) cartId before touching addresses', async () => {
      await expect(
        service.startCustomerCheckout(CUSTOMER_ID, EMAIL, {
          cartId: 'not-a-uuid',
          shippingAddressId: 'addr-ship',
          useShippingAsBilling: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mock.customerAddress.findFirst).not.toHaveBeenCalled();
    });
  });
});
