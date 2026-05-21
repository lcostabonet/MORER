import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CartStatus, ProductStatus } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import type { CartItemResponse, CartResponse } from './cart.types';
import type { AddItemDto } from './dto/add-item.dto';
import type { CreateCartDto } from './dto/create-cart.dto';
import type { UpdateItemDto } from './dto/update-item.dto';

// ─── Design decisions ─────────────────────────────────────────────────────────
//
// 1. STOCK VALIDATION vs RESERVATION
//    Cart validates available stock before add/update but does NOT reserve it
//    (i.e. does not increment Inventory.reservedQuantity). Actual reservation
//    happens at checkout (Fase 8) inside an atomic transaction so that
//    abandoned carts never hold stock indefinitely.
//
// 2. RACE CONDITIONS
//    addItem / updateItem / removeItem run inside $transaction to prevent
//    partial writes. The CartItem @@unique([cartId, variantId]) constraint
//    adds a DB-level guarantee: even if two concurrent requests pass the
//    application-level stock check, the upsert is atomic and no duplicate
//    items are created. Strict serializable isolation for stock reservation
//    is deferred to checkout.
//
// 3. CART EXPIRY
//    Expiry is checked lazily on every write operation (no BullMQ job yet).
//    Automatic scheduled expiry is planned for Fase 11 (Automatizaciones).
// ─────────────────────────────────────────────────────────────────────────────

const CART_TTL_MINUTES = 60 * 24 * 7; // 7 days

const CART_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            select: { id: true, name: true, slug: true },
          },
          inventory: {
            select: { stockQuantity: true, reservedQuantity: true },
          },
        },
      },
    },
  },
} as const;

type RawInventory = { stockQuantity: number; reservedQuantity: number };

type RawVariant = {
  id: string;
  productId: string;
  size: string;
  sku: string;
  priceInCents: number;
  status: string;
  deletedAt: Date | null;
  product: { id: string; name: string; slug: string };
  inventory: RawInventory | null;
};

type RawItem = {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  priceInCents: number;
  variant: RawVariant;
};

type RawCart = {
  id: string;
  sessionId: string | null;
  status: string;
  updatedAt: Date;
  items: RawItem[];
};

const CURRENCY = 'EUR';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateCartDto): Promise<CartResponse> {
    if (dto.sessionId !== undefined && typeof dto.sessionId !== 'string') {
      throw new BadRequestException('sessionId must be a string');
    }

    if (dto.sessionId) {
      const existing = await this.prisma.cart.findFirst({
        where: { sessionId: dto.sessionId, status: CartStatus.ACTIVE },
        include: CART_INCLUDE,
      });

      if (existing) {
        const raw = existing as unknown as RawCart;

        if (this.isCartExpired(raw)) {
          // Mark the stale cart as EXPIRED and fall through to create a fresh one.
          await this.prisma.cart.update({
            where: { id: raw.id },
            data: { status: CartStatus.EXPIRED },
          });
        } else {
          return this.mapCart(raw);
        }
      }
    }

    const cart = await this.prisma.cart.create({
      data: { sessionId: dto.sessionId ?? null, status: CartStatus.ACTIVE },
      include: CART_INCLUDE,
    });

    return this.mapCart(cart as unknown as RawCart);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<CartResponse> {
    const cart = await this.getCart(id);
    return this.mapCart(cart);
  }

  async findBySessionId(sessionId: string): Promise<CartResponse> {
    const cart = await this.prisma.cart.findFirst({
      where: { sessionId, status: CartStatus.ACTIVE },
      include: CART_INCLUDE,
    });
    if (!cart) throw new NotFoundException('Active cart not found for this session');
    return this.mapCart(cart as unknown as RawCart);
  }

  // ─── Items (transactional) ────────────────────────────────────────────────

  async addItem(cartId: string, dto: AddItemDto): Promise<CartResponse> {
    this.validateQuantity(dto.quantity);

    if (!dto.variantId || typeof dto.variantId !== 'string') {
      throw new BadRequestException('variantId is required');
    }

    await this.prisma.$transaction(async (tx) => {
      // Fetch cart and validate inside the transaction.
      const cart = await tx.cart.findUnique({ where: { id: cartId }, include: CART_INCLUDE });
      if (!cart) throw new NotFoundException('Cart not found');
      const raw = cart as unknown as RawCart;

      await this.assertActiveOrExpire(cartId, raw, tx);

      // Validate variant inside the transaction for a consistent read.
      const variant = await tx.productVariant.findFirst({
        where: { id: dto.variantId, status: ProductStatus.ACTIVE, deletedAt: null },
        include: { inventory: { select: { stockQuantity: true, reservedQuantity: true } } },
      });
      if (!variant) throw new NotFoundException('Product variant not found or not available');

      const availableStock = this.calcAvailableStock(
        variant.inventory?.stockQuantity ?? 0,
        variant.inventory?.reservedQuantity ?? 0,
      );

      // Resolve existing quantity to correctly validate the total requested.
      // NOTE: After running `pnpm db:generate` the compound unique key
      // cartId_variantId becomes available — replace findFirst with findUnique
      // and this block with a single tx.cartItem.upsert for cleaner atomicity.
      const existingItem = await tx.cartItem.findFirst({
        where: { cartId, variantId: dto.variantId },
      });
      const newQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

      if (newQuantity > availableStock) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${availableStock}, requested total: ${newQuantity}`,
        );
      }

      // The @@unique([cartId, variantId]) DB constraint prevents duplicates even
      // under concurrent requests. A second concurrent insert will fail with a
      // unique violation rather than creating a duplicate item.
      if (existingItem) {
        await tx.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQuantity },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId,
            variantId: dto.variantId,
            quantity: dto.quantity,
            priceInCents: variant.priceInCents, // price always from DB, never from frontend
          },
        });
      }
    });

    return this.findById(cartId);
  }

  async updateItem(cartId: string, itemId: string, dto: UpdateItemDto): Promise<CartResponse> {
    this.validateQuantity(dto.quantity);

    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { id: cartId }, include: CART_INCLUDE });
      if (!cart) throw new NotFoundException('Cart not found');
      await this.assertActiveOrExpire(cartId, cart as unknown as RawCart, tx);

      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId },
        include: { variant: { include: { inventory: { select: { stockQuantity: true, reservedQuantity: true } } } } },
      });
      if (!item) throw new NotFoundException('Cart item not found');

      const availableStock = this.calcAvailableStock(
        item.variant.inventory?.stockQuantity ?? 0,
        item.variant.inventory?.reservedQuantity ?? 0,
      );

      if (dto.quantity > availableStock) {
        throw new BadRequestException(`Insufficient stock. Available: ${availableStock}`);
      }

      await tx.cartItem.update({ where: { id: itemId }, data: { quantity: dto.quantity } });
    });

    return this.findById(cartId);
  }

  async removeItem(cartId: string, itemId: string): Promise<CartResponse> {
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { id: cartId }, include: CART_INCLUDE });
      if (!cart) throw new NotFoundException('Cart not found');
      await this.assertActiveOrExpire(cartId, cart as unknown as RawCart, tx);

      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId } });
      if (!item) throw new NotFoundException('Cart item not found');

      await tx.cartItem.delete({ where: { id: itemId } });
    });

    return this.findById(cartId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getCart(id: string): Promise<RawCart> {
    const cart = await this.prisma.cart.findUnique({ where: { id }, include: CART_INCLUDE });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart as unknown as RawCart;
  }

  // Checks status AND expiry inside a transaction. Marks as EXPIRED if needed.
  private async assertActiveOrExpire(
    cartId: string,
    cart: RawCart,
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<void> {
    if (cart.status === CartStatus.ACTIVE && this.isCartExpired(cart)) {
      await tx.cart.update({ where: { id: cartId }, data: { status: CartStatus.EXPIRED } });
      throw new BadRequestException('Cart has expired. Please start a new cart.');
    }
    if (cart.status !== CartStatus.ACTIVE) {
      throw new BadRequestException('Cart is not active');
    }
  }

  private isCartExpired(cart: { updatedAt: Date }): boolean {
    return Date.now() - cart.updatedAt.getTime() > CART_TTL_MINUTES * 60 * 1000;
  }

  private validateQuantity(quantity: unknown): void {
    if (!Number.isInteger(quantity) || (quantity as number) < 1) {
      throw new BadRequestException('quantity must be a positive integer (min 1)');
    }
  }

  private calcAvailableStock(stock: number, reserved: number): number {
    return Math.max(0, stock - reserved);
  }

  private mapItem(item: RawItem): CartItemResponse {
    const stock = item.variant.inventory?.stockQuantity ?? 0;
    const reserved = item.variant.inventory?.reservedQuantity ?? 0;
    const availableStock = this.calcAvailableStock(stock, reserved);

    return {
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.product.id,
      productName: item.variant.product.name,
      productSlug: item.variant.product.slug,
      size: item.variant.size,
      sku: item.variant.sku,
      quantity: item.quantity,
      unitPriceInCents: item.priceInCents,
      lineTotalInCents: item.priceInCents * item.quantity,
      availableStock,
      isAvailable: availableStock > 0 && item.variant.status === ProductStatus.ACTIVE,
    };
  }

  private mapCart(cart: RawCart): CartResponse {
    const items = cart.items.map((item) => this.mapItem(item));
    const subtotalInCents = items.reduce((sum, item) => sum + item.lineTotalInCents, 0);

    return {
      id: cart.id,
      sessionId: cart.sessionId,
      status: cart.status,
      items,
      subtotalInCents,
      currency: CURRENCY,
    };
  }
}
