import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CartStatus, CustomerAddressType, OrderStatus, Prisma, ProductStatus } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import type {
  CheckoutAddress,
  CustomerCheckoutState,
  OrderLookupResponse,
  OrderResponse,
} from './checkout.types';
import type { CreateCheckoutFromCartDto } from './dto/create-checkout-from-cart.dto';
import type { CustomerCheckoutDto } from './dto/customer-checkout.dto';
import type { LookupOrderDto } from './dto/lookup-order.dto';
import { normalizeOrderAddressSnapshot } from './order-address-snapshot';

// ─── Design notes ─────────────────────────────────────────────────────────────
//
// 1. STOCK RESERVATION
//    Only Inventory.reservedQuantity is modified here.
//    stockQuantity is reduced only after a confirmed Stripe payment (Fase 8).
//
// 2. RACE CONDITIONS
//    Both startCheckout and cancelOrder use Serializable isolation.
//    PostgreSQL aborts concurrent conflicting transactions (error P2034).
//    This prevents two simultaneous checkouts from the same cart.
//
// 3. GUEST CUSTOMER
//    Orders require a Customer record. Phase 7 creates an anonymous guest
//    Customer per cartId. Phase 8 will capture real customer data at payment.
//
// 4. PRICE SOURCE
//    OrderItem.priceInCents comes from CartItem.priceInCents (backend snapshot,
//    set when item was added to cart from ProductVariant.priceInCents).
//    Never from the frontend request.
//    Checkout uses cart item price snapshot in Fase 7. Final price revalidation
//    will be decided in payment phase.
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY = 'EUR';
const MAX_ORDER_NUMBER_RETRIES = 3;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function assertUuid(value: unknown, field: string): void {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
}

function assertEmail(value: unknown): void {
  if (typeof value !== 'string' || value.trim() === '' || !EMAIL_REGEX.test(value.trim())) {
    throw new BadRequestException('email must be a valid email address');
  }
}

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MORER-${ts}-${rnd}`;
}

function isSerializationError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as Record<string, unknown>).code === 'P2034'
  );
}

function isOrderNumberCollision(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (e.code !== 'P2002') return false;
  const target = (e.meta as Record<string, unknown> | undefined)?.target;
  if (Array.isArray(target)) return (target as string[]).includes('orderNumber');
  if (typeof target === 'string') return target.includes('orderNumber');
  return false;
}

// Internal types for Prisma results
type CartItemVariant = {
  id: string;
  size: string;
  priceInCents: number;
  status: string;
  deletedAt: Date | null;
  product: { name: string; status: string };
  inventory: { stockQuantity: number; reservedQuantity: number } | null;
};

type CartItemWithVariant = {
  id: string;
  variantId: string;
  quantity: number;
  priceInCents: number;
  variant: CartItemVariant;
};

type RawOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalInCents: number;
  shippingInCents: number;
  taxInCents: number;
  // Raw JSON snapshots as stored on the Order. Normalized before leaving the API.
  // The legacy `shippingAddress` column is intentionally NOT read here.
  shippingAddressSnapshot?: Prisma.JsonValue | null;
  billingAddressSnapshot?: Prisma.JsonValue | null;
  createdAt: Date;
  items: {
    id: string;
    variantId: string;  // needed internally to release reservedQuantity on cancel
    productName: string;
    variantSize: string;
    quantity: number;
    priceInCents: number;
  }[];
};

const CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: { select: { name: true, status: true } },
          inventory: { select: { stockQuantity: true, reservedQuantity: true } },
        },
      },
    },
  },
} as const;

const ORDER_INCLUDE = { items: true } as const;

// ─── Phase 11E-alpha: authenticated checkout from saved addresses ─────────────

const ONLY_SPAIN = 'Por ahora solo se admiten direcciones de España.';
const INVALID_SHIPPING = 'La dirección de envío seleccionada no es válida.';
const INVALID_BILLING = 'La dirección de facturación seleccionada no es válida.';
const SHIPPING_NOT_BILLING_USE =
  'La dirección de envío seleccionada no puede usarse también para facturación.';

// Public projection for the selection UI (never exposes customerId/timestamps).
const CHECKOUT_ADDRESS_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  line1: true,
  line2: true,
  postalCode: true,
  city: true,
  province: true,
  countryCode: true,
  type: true,
  isDefaultShipping: true,
  isDefaultBilling: true,
} satisfies Prisma.CustomerAddressSelect;

// Full address fields the service reads to validate + snapshot.
type OwnedAddress = {
  id: string;
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
  type: CustomerAddressType;
};

function canBeShipping(type: CustomerAddressType): boolean {
  return type === CustomerAddressType.SHIPPING || type === CustomerAddressType.BOTH;
}
function canBeBilling(type: CustomerAddressType): boolean {
  return type === CustomerAddressType.BILLING || type === CustomerAddressType.BOTH;
}

// Fixed JSON copy of an address at order time — remains valid even if the source
// address is later edited or deleted.
function snapshotAddress(a: OwnedAddress): Prisma.InputJsonValue {
  return {
    fullName: a.fullName,
    phone: a.phone ?? null,
    line1: a.line1,
    line2: a.line2 ?? null,
    postalCode: a.postalCode,
    city: a.city,
    province: a.province,
    countryCode: a.countryCode,
  };
}

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Start checkout ────────────────────────────────────────────────────────

  async startCheckout(dto: CreateCheckoutFromCartDto): Promise<OrderResponse> {
    assertUuid(dto.cartId, 'cartId');
    assertEmail(dto.email);

    const order = await this.runWithOrderNumberRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.reserveStockAndCreateOrder(tx, {
            cartId: dto.cartId,
            email: dto.email.trim().toLowerCase(),
            // Guest flow: create/resolve the anonymous guest Customer inside the tx
            // AFTER cart validation + stock reservation (unchanged behaviour).
            resolveCustomerId: async (t) => {
              const guestEmail = `anon-${dto.cartId}@morer-checkout.local`;
              const guest = await t.customer.upsert({
                where: { emailNormalized: guestEmail },
                update: {},
                create: { email: guestEmail, emailNormalized: guestEmail },
              });
              return guest.id;
            },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    return this.mapOrder(order);
  }

  // ─── Authenticated checkout from saved addresses (Phase 11E-alpha) ────────────

  /**
   * Returns the authenticated customer's shipping-/billing-compatible addresses
   * and which are default, for the checkout selection UI. No customerId or
   * internal timestamps are exposed.
   */
  async getCustomerCheckout(customerId: string): Promise<CustomerCheckoutState> {
    const addresses = (await this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: CHECKOUT_ADDRESS_SELECT,
    })) as CheckoutAddress[];

    const shippingAddresses = addresses.filter((a) => canBeShipping(a.type as CustomerAddressType));
    const billingAddresses = addresses.filter((a) => canBeBilling(a.type as CustomerAddressType));

    return {
      shippingAddresses,
      billingAddresses,
      defaultShippingId: shippingAddresses.find((a) => a.isDefaultShipping)?.id ?? null,
      defaultBillingId: billingAddresses.find((a) => a.isDefaultBilling)?.id ?? null,
    };
  }

  /**
   * Creates an order for a registered customer using their saved addresses.
   * customerId comes ONLY from the JWT. Both addresses are validated as owned,
   * Spanish, and compatible, then snapshotted onto the order (immutable copies).
   * Reuses the guest checkout's cart-validation / stock-reservation core.
   */
  async startCustomerCheckout(
    customerId: string,
    email: string,
    dto: CustomerCheckoutDto,
  ): Promise<OrderResponse> {
    assertUuid(dto.cartId, 'cartId');

    const shipping = await this.resolveOwnedAddress(customerId, dto.shippingAddressId);
    if (!shipping) throw new BadRequestException(INVALID_SHIPPING);
    if (shipping.countryCode !== 'ES') throw new BadRequestException(ONLY_SPAIN);
    if (!canBeShipping(shipping.type)) throw new BadRequestException(INVALID_SHIPPING);

    let billing: OwnedAddress;
    if (dto.useShippingAsBilling === true) {
      // Reusing the shipping address for billing requires it to be billing-capable.
      if (!canBeBilling(shipping.type)) {
        throw new BadRequestException(SHIPPING_NOT_BILLING_USE);
      }
      billing = shipping;
    } else {
      if (!dto.billingAddressId) throw new BadRequestException(INVALID_BILLING);
      const resolved = await this.resolveOwnedAddress(customerId, dto.billingAddressId);
      if (!resolved) throw new BadRequestException(INVALID_BILLING);
      if (resolved.countryCode !== 'ES') throw new BadRequestException(ONLY_SPAIN);
      if (!canBeBilling(resolved.type)) throw new BadRequestException(INVALID_BILLING);
      billing = resolved;
    }

    const shippingAddressSnapshot = snapshotAddress(shipping);
    const billingAddressSnapshot = snapshotAddress(billing);

    const order = await this.runWithOrderNumberRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.reserveStockAndCreateOrder(tx, {
            cartId: dto.cartId,
            email: email.trim().toLowerCase(),
            resolveCustomerId: async () => customerId,
            shippingAddressSnapshot,
            billingAddressSnapshot,
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    return this.mapOrder(order);
  }

  private async resolveOwnedAddress(
    customerId: string,
    addressId: string,
  ): Promise<OwnedAddress | null> {
    return this.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        line1: true,
        line2: true,
        postalCode: true,
        city: true,
        province: true,
        countryCode: true,
        type: true,
      },
    });
  }

  // ─── Shared checkout core ─────────────────────────────────────────────────────

  // Runs a checkout operation with retry on order-number collisions, mapping
  // Prisma serialization / collision errors to safe ConflictExceptions.
  private async runWithOrderNumberRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (
          err instanceof BadRequestException ||
          err instanceof NotFoundException ||
          err instanceof ConflictException
        ) {
          throw err;
        }
        if (isSerializationError(err)) {
          throw new ConflictException(
            'Checkout could not be completed due to a concurrent request. Please try again.',
          );
        }
        if (isOrderNumberCollision(err)) {
          if (attempt < MAX_ORDER_NUMBER_RETRIES) continue;
          throw new ConflictException(
            'Could not generate a unique order number. Please try again.',
          );
        }
        throw err;
      }
    }
    // Unreachable — the loop always returns or throws before exhausting retries.
    throw new ConflictException('Checkout could not be completed. Please try again.');
  }

  // Cart validation + stock reservation + order creation + cart conversion,
  // shared by the guest and authenticated flows. Order of operations (validate →
  // reserve → resolve customer → create order → convert cart) is preserved.
  private async reserveStockAndCreateOrder(
    tx: Prisma.TransactionClient,
    opts: {
      cartId: string;
      email: string;
      resolveCustomerId: (tx: Prisma.TransactionClient) => Promise<string>;
      shippingAddressSnapshot?: Prisma.InputJsonValue;
      billingAddressSnapshot?: Prisma.InputJsonValue;
    },
  ): Promise<RawOrder> {
    const cart = await tx.cart.findUnique({
      where: { id: opts.cartId },
      include: CART_INCLUDE,
    });

    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.status !== CartStatus.ACTIVE) {
      throw new BadRequestException(
        'Cart is not active. It may have been converted or expired.',
      );
    }
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    let totalInCents = 0;
    for (const item of cart.items as CartItemWithVariant[]) {
      const { variant } = item;

      if (variant.status !== ProductStatus.ACTIVE || variant.deletedAt !== null) {
        throw new BadRequestException(`Variant "${variant.size}" is no longer available`);
      }
      if (variant.product.status !== ProductStatus.ACTIVE) {
        throw new BadRequestException(
          `Product "${variant.product.name}" is no longer available`,
        );
      }

      const stock = variant.inventory?.stockQuantity ?? 0;
      const reserved = variant.inventory?.reservedQuantity ?? 0;
      const available = Math.max(0, stock - reserved);

      if (item.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for "${variant.product.name}" (${variant.size}). ` +
            `Available: ${available}, requested: ${item.quantity}`,
        );
      }

      // Reserve stock — only reservedQuantity, never stockQuantity.
      await tx.inventory.update({
        where: { variantId: item.variantId },
        data: { reservedQuantity: { increment: item.quantity } },
      });

      totalInCents += item.priceInCents * item.quantity;
    }

    const customerId = await opts.resolveCustomerId(tx);

    const newOrder = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId,
        status: OrderStatus.PENDING_PAYMENT,
        totalInCents,
        shippingInCents: 0, // calculated at payment (Fase 8)
        taxInCents: 0, // calculated at payment (Fase 8)
        email: opts.email,
        ...(opts.shippingAddressSnapshot !== undefined
          ? { shippingAddressSnapshot: opts.shippingAddressSnapshot }
          : {}),
        ...(opts.billingAddressSnapshot !== undefined
          ? { billingAddressSnapshot: opts.billingAddressSnapshot }
          : {}),
        items: {
          create: (cart.items as CartItemWithVariant[]).map((item) => ({
            variantId: item.variantId,
            productName: item.variant.product.name,
            variantSize: item.variant.size,
            quantity: item.quantity,
            priceInCents: item.priceInCents, // snapshot from cart, set by backend
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    // Mark cart as CONVERTED — prevents re-checkout.
    await tx.cart.update({
      where: { id: opts.cartId },
      data: { status: CartStatus.CONVERTED },
    });

    return newOrder as unknown as RawOrder;
  }

  // ─── Find order ────────────────────────────────────────────────────────────

  async findOrder(orderId: string): Promise<OrderResponse> {
    assertUuid(orderId, 'orderId');
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.mapOrder(order as unknown as RawOrder);
  }

  // ─── Cancel order ──────────────────────────────────────────────────────────

  async cancelOrder(orderId: string): Promise<OrderResponse> {
    assertUuid(orderId, 'orderId');
    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: ORDER_INCLUDE,
          });

          if (!order) throw new NotFoundException('Order not found');
          if (order.status !== OrderStatus.PENDING_PAYMENT) {
            throw new BadRequestException(
              'Only orders with status pending_payment can be cancelled',
            );
          }

          // Release reserved stock for each item.
          for (const item of (order as unknown as RawOrder).items) {
            const inv = await tx.inventory.findUnique({
              where: { variantId: item.variantId },
              select: { reservedQuantity: true },
            });

            if (!inv || inv.reservedQuantity < item.quantity) {
              throw new ConflictException(
                `Inventory inconsistency for variant ${item.variantId}: ` +
                  `cannot release ${item.quantity} unit(s) ` +
                  `(currently reserved: ${inv?.reservedQuantity ?? 0})`,
              );
            }

            await tx.inventory.update({
              where: { variantId: item.variantId },
              data: { reservedQuantity: { decrement: item.quantity } },
            });
          }

          const cancelled = await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CANCELLED },
            include: ORDER_INCLUDE,
          });

          return cancelled;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return this.mapOrder(order as unknown as RawOrder);
    } catch (err) {
      if (
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ConflictException
      ) {
        throw err;
      }
      if (isSerializationError(err)) {
        throw new ConflictException('Cancel conflict due to concurrent request. Please try again.');
      }
      throw err;
    }
  }

  // ─── Lookup order ─────────────────────────────────────────────────────────

  async lookupOrder(dto: LookupOrderDto): Promise<OrderLookupResponse> {
    const orderNumber = typeof dto.orderNumber === 'string' ? dto.orderNumber.trim() : '';
    if (!orderNumber) {
      throw new BadRequestException('orderNumber must be a non-empty string');
    }
    assertEmail(dto.email);
    const email = dto.email.trim().toLowerCase();

    const order = await this.prisma.order.findFirst({
      where: { orderNumber, email },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException('No hemos encontrado ningún pedido con esos datos.');
    }

    return { orderId: order.id };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private mapOrder(order: RawOrder): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalInCents: order.totalInCents,
      shippingInCents: order.shippingInCents,
      taxInCents: order.taxInCents,
      currency: CURRENCY,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        variantSize: item.variantSize,
        quantity: item.quantity,
        unitPriceInCents: item.priceInCents,
        lineTotalInCents: item.priceInCents * item.quantity,
      })),
      // Normalized immutable snapshots — decoupled from the live CustomerAddress
      // and never read from the legacy `shippingAddress` column.
      shippingAddress: normalizeOrderAddressSnapshot(order.shippingAddressSnapshot),
      billingAddress: normalizeOrderAddressSnapshot(order.billingAddressSnapshot),
      createdAt: order.createdAt,
    };
  }
}
