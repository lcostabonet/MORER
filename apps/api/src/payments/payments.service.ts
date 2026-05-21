import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@morer/database';
import Stripe from 'stripe';
import { PrismaService } from '../database/prisma.service';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { CreatePaymentIntentResponse, PaymentResponse } from './payments.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: unknown, field: string): void {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
}

function isSerializationError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as Record<string, unknown>).code === 'P2034'
  );
}

function isPaymentCollision(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (e.code !== 'P2002') return false;
  const target = (e.meta as Record<string, unknown> | undefined)?.target;
  if (Array.isArray(target))
    return (target as string[]).some((t) => String(t).includes('stripePaymentIntentId'));
  if (typeof target === 'string') return target.includes('stripePaymentIntentId');
  return false;
}

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is required for PaymentsModule');
    }
    this.stripe = new Stripe(key);
  }

  // ─── Create PaymentIntent ──────────────────────────────────────────────────

  async createPaymentIntent(dto: CreatePaymentIntentDto): Promise<CreatePaymentIntentResponse> {
    assertUuid(dto.orderId, 'orderId');

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Order is not eligible for payment (status: ${order.status})`,
      );
    }

    // Idempotency: if a PENDING Payment already exists for this order, return its PI.
    const existing = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: PaymentStatus.PENDING },
    });

    if (existing) {
      const pi = await this.stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      if (!pi.client_secret) {
        throw new InternalServerErrorException('PaymentIntent missing client_secret');
      }
      return {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        amountInCents: existing.amountInCents,
        currency: existing.currency,
      };
    }

    // idempotencyKey ensures Stripe returns the same PI on concurrent calls.
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: order.totalInCents,
        currency: 'eur',
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      },
      { idempotencyKey: order.id },
    );

    if (!pi.client_secret) {
      throw new InternalServerErrorException('Stripe did not return a client_secret');
    }

    try {
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          stripePaymentIntentId: pi.id,
          status: PaymentStatus.PENDING,
          amountInCents: order.totalInCents,
          currency: 'eur',
        },
      });
    } catch (err) {
      if (isPaymentCollision(err)) {
        // Concurrent request already created the Payment — return the PI we just created.
        return {
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          amountInCents: order.totalInCents,
          currency: 'eur',
        };
      }
      throw err;
    }

    return {
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      amountInCents: order.totalInCents,
      currency: 'eur',
    };
  }

  // ─── Stripe webhook ────────────────────────────────────────────────────────

  async handleStripeWebhook(
    rawBody: Buffer | undefined,
    signature: string,
  ): Promise<{ received: boolean }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new InternalServerErrorException('STRIPE_WEBHOOK_SECRET is not configured');
    }
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      default:
        // Unknown event types are acknowledged without processing.
        break;
    }

    return { received: true };
  }

  // ─── payment_intent.succeeded ─────────────────────────────────────────────

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    // Unknown PaymentIntent (test event or different environment) — acknowledge silently.
    if (!payment) return;

    // Idempotency: already processed.
    if (payment.status === PaymentStatus.SUCCEEDED) return;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: payment.orderId },
            include: { items: true },
          });

          if (!order) {
            throw new NotFoundException(`Order ${payment.orderId} not found`);
          }

          // Decrement stock for each item with explicit guards against negative values.
          for (const item of order.items) {
            const inv = await tx.inventory.findUnique({
              where: { variantId: item.variantId },
              select: { stockQuantity: true, reservedQuantity: true },
            });

            if (!inv) {
              throw new ConflictException(
                `Inventory not found for variant ${item.variantId}`,
              );
            }
            if (inv.stockQuantity < item.quantity) {
              throw new ConflictException(
                `Insufficient stockQuantity for variant ${item.variantId}: ` +
                  `stock=${inv.stockQuantity}, requested=${item.quantity}`,
              );
            }
            if (inv.reservedQuantity < item.quantity) {
              throw new ConflictException(
                `Insufficient reservedQuantity for variant ${item.variantId}: ` +
                  `reserved=${inv.reservedQuantity}, requested=${item.quantity}`,
              );
            }

            await tx.inventory.update({
              where: { variantId: item.variantId },
              data: {
                stockQuantity: { decrement: item.quantity },
                reservedQuantity: { decrement: item.quantity },
              },
            });
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.SUCCEEDED },
          });

          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.PAID },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isSerializationError(err)) {
        // Concurrent webhook delivery — the other handler will complete processing.
        return;
      }
      throw err;
    }
  }

  // ─── payment_intent.payment_failed ────────────────────────────────────────

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Stripe allows retrying a failed PaymentIntent with a new payment method.
    // The Order remains PENDING_PAYMENT so the customer can retry without a new checkout.
    // reservedQuantity is intentionally NOT released here — the reservation stays active.
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.findUnique({
            where: { stripePaymentIntentId: paymentIntent.id },
          });

          // Unknown PaymentIntent — acknowledge silently.
          if (!payment) return;

          // Idempotency: already processed, or succeeded payment must not be overwritten.
          if (payment.status === PaymentStatus.FAILED) return;
          if (payment.status === PaymentStatus.SUCCEEDED) return;

          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.FAILED },
          });
          // Order.status intentionally stays PENDING_PAYMENT.
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isSerializationError(err)) {
        // Concurrent webhook delivery — the other handler will complete processing.
        return;
      }
      throw err;
    }
  }

  // ─── Find payments by order ────────────────────────────────────────────────

  async findPaymentsByOrder(orderId: string): Promise<PaymentResponse[]> {
    assertUuid(orderId, 'orderId');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      status: p.status,
      amountInCents: p.amountInCents,
      currency: p.currency,
      createdAt: p.createdAt,
    }));
  }
}
