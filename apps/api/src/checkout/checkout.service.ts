import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CartStatus, OrderStatus, Prisma, ProductStatus } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import type { OrderResponse } from './checkout.types';
import type { CreateCheckoutFromCartDto } from './dto/create-checkout-from-cart.dto';

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

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Start checkout ────────────────────────────────────────────────────────

  async startCheckout(dto: CreateCheckoutFromCartDto): Promise<OrderResponse> {
    assertUuid(dto.cartId, 'cartId');
    assertEmail(dto.email);

    for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_RETRIES; attempt++) {
      try {
        const order = await this.prisma.$transaction(
          async (tx) => {
            // 1. Fetch and validate cart inside transaction.
            const cart = await tx.cart.findUnique({
              where: { id: dto.cartId },
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

            // 2. Validate each item and reserve stock.
            let totalInCents = 0;

            for (const item of cart.items as CartItemWithVariant[]) {
              const { variant } = item;

              if (variant.status !== ProductStatus.ACTIVE || variant.deletedAt !== null) {
                throw new BadRequestException(
                  `Variant "${variant.size}" is no longer available`,
                );
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

            // 3. Create anonymous guest Customer (Phase 8 will capture real data).
            const guestEmail = `anon-${dto.cartId}@morer-checkout.local`;
            const customer = await tx.customer.upsert({
              where: { emailNormalized: guestEmail },
              update: {},
              create: { email: guestEmail, emailNormalized: guestEmail },
            });

            // 4. Create Order with snapshot of each item.
            const newOrder = await tx.order.create({
              data: {
                orderNumber: generateOrderNumber(),
                customerId: customer.id,
                status: OrderStatus.PENDING_PAYMENT,
                totalInCents,
                shippingInCents: 0, // calculated at payment (Fase 8)
                taxInCents: 0,      // calculated at payment (Fase 8)
                email: dto.email.trim().toLowerCase(),
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

            // 5. Mark cart as CONVERTED — prevents re-checkout.
            await tx.cart.update({
              where: { id: dto.cartId },
              data: { status: CartStatus.CONVERTED },
            });

            return newOrder;
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
      createdAt: order.createdAt,
    };
  }
}
