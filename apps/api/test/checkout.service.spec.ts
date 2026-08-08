import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CheckoutService } from '../src/checkout/checkout.service';
import { asPrismaService, createPrismaMock } from './helpers/prisma-mock';
import type { PrismaMock } from './helpers/prisma-mock';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const CART_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ORDER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const ORDER_NUMBER = 'MORER-ABC1-XYZ2';

// Minimal valid cart for startCheckout.
// Status and variant/product status strings match Prisma enum values (ACTIVE, etc.)
// so the guard checks inside the transaction pass without importing from @morer/database.
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

const MOCK_CUSTOMER_ID = 'customer-1';
const MOCK_CUSTOMER = { id: MOCK_CUSTOMER_ID };

// Shape satisfies the internal RawOrder type used by mapOrder.
const MOCK_ORDER = {
  id: ORDER_ID,
  orderNumber: ORDER_NUMBER,
  customerId: MOCK_CUSTOMER_ID,
  status: 'PENDING_PAYMENT',
  totalInCents: 1000,
  shippingInCents: 0,
  taxInCents: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  items: [
    {
      id: 'item-1',
      variantId: 'variant-1',
      productName: 'T-Shirt',
      variantSize: 'M',
      quantity: 1,
      priceInCents: 1000,
    },
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeService(mock: PrismaMock): CheckoutService {
  return new CheckoutService(asPrismaService(mock));
}

// Wire the mocks so that a startCheckout call flows through the full transaction.
function wireStartCheckoutMocks(mock: PrismaMock): void {
  mock.__tx.cart.findUnique.mockResolvedValue(VALID_CART);
  mock.__tx.inventory.update.mockResolvedValue({});
  mock.__tx.customer.upsert.mockResolvedValue(MOCK_CUSTOMER);
  mock.__tx.order.create.mockResolvedValue(MOCK_ORDER);
  mock.__tx.cart.update.mockResolvedValue({});
}

// ─── Phase 9D-alpha: email capture during checkout ──────────────────────────

describe('CheckoutService.startCheckout (9D-alpha email capture)', () => {
  let mock: PrismaMock;
  let service: CheckoutService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = makeService(mock);
  });

  // 1. Valid email

  describe('valid email', () => {
    it('accepts a well-formed email and stores it normalised — trimmed and lowercased', async () => {
      wireStartCheckoutMocks(mock);

      await service.startCheckout({
        cartId: CART_ID,
        email: '  Cliente@Ejemplo.COM  ',
      });

      expect(mock.$transaction).toHaveBeenCalledOnce();
      const createCall = mock.__tx.order.create.mock.calls[0][0] as {
        data: { email: string };
      };
      expect(createCall.data.email).toBe('cliente@ejemplo.com');
    });

    it('preserves the full transaction flow: stock reserved, cart marked as CONVERTED', async () => {
      wireStartCheckoutMocks(mock);

      const result = await service.startCheckout({
        cartId: CART_ID,
        email: 'valid@example.com',
      });

      // Stock reservation must have happened.
      expect(mock.__tx.inventory.update).toHaveBeenCalledOnce();
      // Cart must be converted.
      expect(mock.__tx.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CONVERTED' } }),
      );
      // Order response is returned.
      expect(result.id).toBe(ORDER_ID);
    });
  });

  // 2. Invalid email

  describe('invalid email', () => {
    it.each([
      ['bare string without @', 'not-an-email'],
      ['missing TLD', 'user@domain'],
      ['no local part', '@domain.com'],
      ['spaces in the middle', 'spaces in@email.com'],
    ])('rejects "%s" before entering the transaction', async (_, badEmail) => {
      await expect(
        service.startCheckout({ cartId: CART_ID, email: badEmail }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // The validation is synchronous and runs before $transaction is called.
      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('does not touch stock or payment flow when email is invalid', async () => {
      await expect(
        service.startCheckout({ cartId: CART_ID, email: 'not-an-email' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mock.__tx.inventory.update).not.toHaveBeenCalled();
      expect(mock.__tx.order.create).not.toHaveBeenCalled();
    });
  });

  // 3. Omitted email

  describe('omitted email', () => {
    it('rejects undefined email — email is required by the public checkout contract', async () => {
      await expect(
        // Cast simulates an incomplete payload (e.g. missing key in JSON body).
        service.startCheckout({
          cartId: CART_ID,
          email: undefined as unknown as string,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an empty string email', async () => {
      await expect(
        service.startCheckout({ cartId: CART_ID, email: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only email', async () => {
      await expect(
        service.startCheckout({ cartId: CART_ID, email: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mock.$transaction).not.toHaveBeenCalled();
    });
  });

  // 4. Legacy orders with email: null

  describe('legacy orders (email: null)', () => {
    it('reads an order that was created before the email field existed without throwing', async () => {
      // Orders predating Phase 9D-alpha have email: null in the DB.
      // findOrder calls prisma.order.findUnique (top-level, not inside a tx).
      const legacyOrder = { ...MOCK_ORDER, email: null };
      mock.order.findUnique.mockResolvedValue(legacyOrder);

      // mapOrder does not expose or access the email field — this verifies that
      // null email does not cause a runtime error in the serialisation layer.
      const result = await service.findOrder(ORDER_ID, { userId: MOCK_CUSTOMER_ID });

      expect(result.id).toBe(ORDER_ID);
      expect(result).not.toHaveProperty('email');
    });
  });
});

// ─── Phase 9D-beta: order lookup by order number + email ──────────────────

describe('CheckoutService.lookupOrder (9D-beta order lookup)', () => {
  let mock: PrismaMock;
  let service: CheckoutService;

  beforeEach(() => {
    mock = createPrismaMock();
    service = makeService(mock);
  });

  // 1. Correct lookup

  describe('matching order and email', () => {
    it('returns orderId when order number and email match', async () => {
      mock.order.findFirst.mockResolvedValue({ id: ORDER_ID });

      const result = await service.lookupOrder({
        orderNumber: ORDER_NUMBER,
        email: 'test@example.com',
      });

      expect(result.orderId).toBe(ORDER_ID);
    });

    it('normalises the email (trim + lowercase) before querying the DB', async () => {
      mock.order.findFirst.mockResolvedValue({ id: ORDER_ID });

      await service.lookupOrder({
        orderNumber: ORDER_NUMBER,
        email: '  Test@Example.COM  ',
      });

      expect(mock.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderNumber: ORDER_NUMBER, email: 'test@example.com' },
        }),
      );
    });

    it('finds the order regardless of email casing or surrounding whitespace', async () => {
      mock.order.findFirst.mockResolvedValue({ id: ORDER_ID });

      const result = await service.lookupOrder({
        orderNumber: ORDER_NUMBER,
        email: '  UPPER@CASE.COM  ',
      });

      expect(result.orderId).toBe(ORDER_ID);
      expect(mock.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderNumber: ORDER_NUMBER, email: 'upper@case.com' },
        }),
      );
    });
  });

  // 2. Wrong data

  describe('non-matching data', () => {
    it('throws NotFoundException when the email does not match the order', async () => {
      mock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.lookupOrder({ orderNumber: ORDER_NUMBER, email: 'wrong@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the order number does not exist', async () => {
      mock.order.findFirst.mockResolvedValue(null);

      await expect(
        service.lookupOrder({ orderNumber: 'MORER-DOES-NOT-EXIST', email: 'test@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the same error message for wrong email and wrong order number — no enumeration', async () => {
      // Both cases must be indistinguishable to prevent information leakage.
      mock.order.findFirst.mockResolvedValue(null);

      let wrongEmailErr: unknown;
      let wrongOrderErr: unknown;

      try {
        await service.lookupOrder({ orderNumber: ORDER_NUMBER, email: 'wrong@example.com' });
      } catch (e) {
        wrongEmailErr = e;
      }

      mock.order.findFirst.mockResolvedValue(null);

      try {
        await service.lookupOrder({ orderNumber: 'MORER-NONEXISTENT', email: 'test@example.com' });
      } catch (e) {
        wrongOrderErr = e;
      }

      expect((wrongEmailErr as NotFoundException).message).toBe(
        (wrongOrderErr as NotFoundException).message,
      );
    });
  });

  // 3. Validation

  describe('input validation', () => {
    it.each([
      ['invalid email', { orderNumber: ORDER_NUMBER, email: 'not-an-email' }],
      ['empty email', { orderNumber: ORDER_NUMBER, email: '' }],
      ['whitespace-only email', { orderNumber: ORDER_NUMBER, email: '   ' }],
      [
        'undefined email',
        { orderNumber: ORDER_NUMBER, email: undefined as unknown as string },
      ],
    ])(
      'rejects %s with BadRequestException before querying the DB',
      async (_, dto) => {
        await expect(service.lookupOrder(dto)).rejects.toBeInstanceOf(BadRequestException);
        expect(mock.order.findFirst).not.toHaveBeenCalled();
      },
    );

    it('rejects an empty orderNumber with BadRequestException', async () => {
      await expect(
        service.lookupOrder({ orderNumber: '', email: 'test@example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mock.order.findFirst).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only orderNumber with BadRequestException', async () => {
      await expect(
        service.lookupOrder({ orderNumber: '   ', email: 'test@example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mock.order.findFirst).not.toHaveBeenCalled();
    });

    it('rejects undefined orderNumber with BadRequestException', async () => {
      await expect(
        service.lookupOrder({
          orderNumber: undefined as unknown as string,
          email: 'test@example.com',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mock.order.findFirst).not.toHaveBeenCalled();
    });
  });
});
