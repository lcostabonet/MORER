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
import type { ReconcilePaymentDto } from './dto/reconcile-payment.dto';
import type {
  CreatePaymentIntentResponse,
  PaymentResponse,
  ReconcileResponse,
} from './payments.types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Statuses where a PaymentIntent can still accept a payment method and be confirmed.
const REUSABLE_PI_STATUSES: Stripe.PaymentIntent.Status[] = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
];

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

  // ─── Core transaction: mark Payment SUCCEEDED + Order PAID + decrement stock ─

  // Single source of truth for applying a confirmed payment. Idempotent and
  // protected by Serializable isolation so concurrent callers (webhook + reconcile)
  // converge safely without double-decrementing stock.
  // Returns true when this specific call applied the payment (stock decremented, statuses
  // updated). Returns false when the work was already done — either by a previous call
  // (idempotency guard) or by a concurrent caller (Serializable conflict absorbed).
  private async applyPaymentSuccess(stripePaymentIntentId: string): Promise<boolean> {
    let applied = false;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.findUnique({
            where: { stripePaymentIntentId },
          });

          if (!payment) return; // caller must ensure the Payment record exists first

          const order = await tx.order.findUnique({
            where: { id: payment.orderId },
            include: { items: true },
          });

          if (!order) {
            throw new NotFoundException(`Order ${payment.orderId} not found`);
          }

          if (payment.status === PaymentStatus.SUCCEEDED) {
            // Payment already done. If order is somehow still PENDING_PAYMENT
            // (edge case: crash between the two updates), fix it now.
            if (order.status !== OrderStatus.PAID) {
              await tx.order.update({
                where: { id: order.id },
                data: { status: OrderStatus.PAID },
              });
              console.log(`[payments] Order fixed to PAID (payment was already SUCCEEDED): ${order.id}`);
            }
            return; // applied stays false — work was done by a previous call
          }

          if (order.status === OrderStatus.PAID) {
            // Order already paid by a concurrent path — just mark the payment.
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.SUCCEEDED },
            });
            console.log(`[payments] Payment marked SUCCEEDED (order already PAID): ${stripePaymentIntentId}`);
            return; // applied stays false — order was already settled
          }

          // Decrement stock for each item with explicit guards against negative values.
          for (const item of order.items) {
            const inv = await tx.inventory.findUnique({
              where: { variantId: item.variantId },
              select: { stockQuantity: true, reservedQuantity: true },
            });

            if (!inv) {
              throw new ConflictException(`Inventory not found for variant ${item.variantId}`);
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
          console.log(`[payments] Payment marked as SUCCEEDED: ${stripePaymentIntentId}`);

          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.PAID },
          });
          console.log(`[payments] Order marked as PAID: ${order.id}`);
          applied = true; // this call did the full work
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (isSerializationError(err)) {
        // Concurrent write (webhook + reconcile racing) — the winner will complete.
        console.log(`[payments] Serialization conflict in applyPaymentSuccess — safe to ignore: ${stripePaymentIntentId}`);
        return false;
      }
      throw err;
    }
    return applied;
  }

  // ─── Create PaymentIntent ──────────────────────────────────────────────────

  async createPaymentIntent(dto: CreatePaymentIntentDto): Promise<CreatePaymentIntentResponse> {
    console.log('[payments] POST /payments/create-intent — orderId:', dto.orderId);
    assertUuid(dto.orderId, 'orderId');

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    console.log('[payments] order found — status:', order.status, '| total:', order.totalInCents);

    // If the order is already paid, tell the frontend immediately so it can refresh.
    if (order.status === OrderStatus.PAID) {
      console.log('[payments] order already paid');
      throw new ConflictException('ORDER_ALREADY_PAID');
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Order is not eligible for payment (status: ${order.status})`,
      );
    }

    // Get the most recent Payment for this order, if any.
    const existing = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      console.log(
        `[payments] existing payment found — PI: ${existing.stripePaymentIntentId} | DB status: ${existing.status}`,
      );
      const pi = await this.stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
      console.log(`[payments] Stripe PI retrieved — id: ${pi.id} | status: ${pi.status}`);

      if (REUSABLE_PI_STATUSES.includes(pi.status)) {
        if (!pi.client_secret) {
          throw new InternalServerErrorException('PaymentIntent missing client_secret');
        }
        console.log('[payments] returning reusable clientSecret for PI:', pi.id);
        return {
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          amountInCents: existing.amountInCents,
          currency: existing.currency,
        };
      }

      if (pi.status === 'succeeded') {
        // Stripe confirmed but our DB is out of sync — reconcile now (including stock).
        console.log('[payments] existing PI terminal (succeeded) — reconciling DB');
        await this.applyPaymentSuccess(pi.id);
        console.log('[payments] order already paid (reconciled from Stripe)');
        throw new ConflictException('ORDER_ALREADY_PAID');
      }

      // PI is in a terminal/non-reusable state (canceled, etc.) — create a replacement.
      console.log(
        `[payments] existing PI terminal, not returning clientSecret — status: ${pi.status}`,
      );
      console.log('[payments] creating replacement PaymentIntent');
      // Use a unique idempotency key so Stripe issues a fresh PI (not the canceled one).
      const replacement = await this.stripe.paymentIntents.create(
        {
          amount: order.totalInCents,
          currency: 'eur',
          metadata: { orderId: order.id, orderNumber: order.orderNumber },
        },
        { idempotencyKey: `${order.id}-${existing.id}` },
      );
      console.log(`[payments] replacement PI created — id: ${replacement.id} | status: ${replacement.status}`);

      if (!replacement.client_secret) {
        throw new InternalServerErrorException('Stripe did not return a client_secret for replacement PI');
      }

      await this.prisma.payment.upsert({
        where: { stripePaymentIntentId: replacement.id },
        create: {
          orderId: order.id,
          stripePaymentIntentId: replacement.id,
          status: PaymentStatus.PENDING,
          amountInCents: order.totalInCents,
          currency: 'eur',
        },
        update: {},
      });
      console.log(`[payments] replacement Payment record saved — PI: ${replacement.id}`);

      return {
        clientSecret: replacement.client_secret,
        paymentIntentId: replacement.id,
        amountInCents: order.totalInCents,
        currency: 'eur',
      };
    }

    // No existing Payment — create (or retrieve via idempotency cache) a Stripe PaymentIntent.
    // The idempotency key is stable per order so concurrent calls get the same PI.
    // However, within 24 h the cache may return a PI that has since reached a terminal state
    // (e.g. dev resets the DB but not Stripe). We must check status before returning.
    console.log('[payments] Creating new Stripe PaymentIntent — amount:', order.totalInCents, 'eur');
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: order.totalInCents,
        currency: 'eur',
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      },
      { idempotencyKey: order.id },
    );
    console.log(`[payments] Stripe PI created — id: ${pi.id} | status: ${pi.status}`);

    if (!pi.client_secret) {
      throw new InternalServerErrorException('Stripe did not return a client_secret');
    }

    // Persist before the status check so we have the DB record ID available for the
    // replacement idempotency key if the PI turns out to be terminal.
    await this.prisma.payment.upsert({
      where: { stripePaymentIntentId: pi.id },
      create: {
        orderId: order.id,
        stripePaymentIntentId: pi.id,
        status: PaymentStatus.PENDING,
        amountInCents: order.totalInCents,
        currency: 'eur',
      },
      update: {},
    });
    console.log(`[payments] Payment record saved — PI: ${pi.id}`);

    if (pi.status === 'succeeded') {
      // Idempotency cache returned a PI that was already paid — DB was out of sync.
      console.log('[payments] existing PI terminal (succeeded) — reconciling DB');
      await this.applyPaymentSuccess(pi.id);
      console.log('[payments] order already paid (reconciled from Stripe)');
      throw new ConflictException('ORDER_ALREADY_PAID');
    }

    if (!REUSABLE_PI_STATUSES.includes(pi.status)) {
      // Idempotency cache returned a canceled or otherwise non-reusable PI.
      console.log(
        `[payments] existing PI terminal, not returning clientSecret — status: ${pi.status}`,
      );
      console.log('[payments] creating replacement PaymentIntent');

      const piRecord = await this.prisma.payment.findUnique({
        where: { stripePaymentIntentId: pi.id },
        select: { id: true },
      });

      const replacement = await this.stripe.paymentIntents.create(
        {
          amount: order.totalInCents,
          currency: 'eur',
          metadata: { orderId: order.id, orderNumber: order.orderNumber },
        },
        { idempotencyKey: `${order.id}-${piRecord?.id ?? 'new'}` },
      );
      console.log(`[payments] replacement PI created — id: ${replacement.id} | status: ${replacement.status}`);

      if (!replacement.client_secret) {
        throw new InternalServerErrorException('Stripe did not return a client_secret for replacement PI');
      }

      await this.prisma.payment.upsert({
        where: { stripePaymentIntentId: replacement.id },
        create: {
          orderId: order.id,
          stripePaymentIntentId: replacement.id,
          status: PaymentStatus.PENDING,
          amountInCents: order.totalInCents,
          currency: 'eur',
        },
        update: {},
      });
      console.log(`[payments] replacement Payment record saved — PI: ${replacement.id}`);

      return {
        clientSecret: replacement.client_secret,
        paymentIntentId: replacement.id,
        amountInCents: order.totalInCents,
        currency: 'eur',
      };
    }

    console.log('[payments] returning reusable clientSecret for PI:', pi.id);
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

    console.log('[payments] POST /payments/webhook/stripe — verifying signature');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      console.error('[payments] Webhook signature verification FAILED');
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
    console.log('[payments] Webhook event received — type:', event.type, '| id:', event.id);

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
    // Pre-check outside the transaction to log early and short-circuit obvious cases.
    const preCheck = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (preCheck?.status === PaymentStatus.SUCCEEDED) {
      console.log(`[payments] Payment already processed: ${paymentIntent.id}`);
      return;
    }

    // If no Payment record exists, try to create one from PaymentIntent metadata.
    // This handles stripe CLI triggers (stripe trigger payment_intent.succeeded)
    // and edge cases where the webhook arrives before create-intent writes to DB.
    if (!preCheck) {
      const orderId = (paymentIntent.metadata as Record<string, string> | undefined)?.orderId;
      if (!orderId) {
        console.log(
          `[payments] No Payment found for PaymentIntent ${paymentIntent.id} and no orderId in metadata — skipping`,
        );
        return;
      }
      await this.prisma.payment.upsert({
        where: { stripePaymentIntentId: paymentIntent.id },
        create: {
          orderId,
          stripePaymentIntentId: paymentIntent.id,
          status: PaymentStatus.PENDING,
          amountInCents: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
        update: {},
      });
      console.log(`[payments] Payment created from webhook metadata for PI ${paymentIntent.id}`);
    }

    await this.applyPaymentSuccess(paymentIntent.id);
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
        return;
      }
      throw err;
    }
  }

  // ─── Reconcile ────────────────────────────────────────────────────────────

  // Frontend fallback called immediately after stripe.confirmPayment succeeds.
  // Verifies the PaymentIntent against Stripe as the source of truth before
  // applying any DB changes, so it is safe to call from the browser.
  async reconcilePayment(dto: ReconcilePaymentDto): Promise<ReconcileResponse> {
    console.log('[payments] POST /payments/reconcile — orderId:', dto.orderId, '| PI:', dto.paymentIntentId);
    assertUuid(dto.orderId, 'orderId');

    if (
      !dto.paymentIntentId ||
      typeof dto.paymentIntentId !== 'string' ||
      dto.paymentIntentId.trim() === ''
    ) {
      throw new BadRequestException('paymentIntentId must be a non-empty string');
    }

    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Ownership check runs before the alreadyPaid early return so that passing a PI
    // from another order always yields 400, regardless of the target order's status.
    const payment = await this.prisma.payment.findUnique({
      where: { stripePaymentIntentId: dto.paymentIntentId },
    });
    if (!payment) throw new NotFoundException('Payment record not found for this PaymentIntent');
    if (payment.orderId !== dto.orderId) {
      throw new BadRequestException('PaymentIntent does not belong to this order');
    }

    // Idempotent early return: order is already in its final state.
    if (order.status === OrderStatus.PAID) {
      console.log('[payments] reconcile: order already PAID —', dto.orderId);
      return { reconciled: false, alreadyPaid: true, status: order.status };
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Order is not eligible for reconciliation (status: ${order.status})`,
      );
    }

    // Verify against Stripe (source of truth). Never trust the frontend alone.
    const pi = await this.stripe.paymentIntents.retrieve(dto.paymentIntentId);
    console.log('[payments] reconcile: Stripe PI status:', pi.status, '| PI:', pi.id);

    // Anti-fraud: the PI metadata must reference the same order.
    const metaOrderId = (pi.metadata as Record<string, string> | null)?.orderId;
    if (metaOrderId !== dto.orderId) {
      throw new BadRequestException('PaymentIntent metadata orderId does not match the provided orderId');
    }

    // Anti-fraud: amount and currency must match the order exactly.
    if (pi.amount !== order.totalInCents) {
      throw new BadRequestException('PaymentIntent amount does not match order total');
    }
    if (pi.currency !== payment.currency) {
      throw new BadRequestException('PaymentIntent currency does not match payment currency');
    }

    // PI has not settled yet — return current status so the frontend can retry.
    if (pi.status !== 'succeeded') {
      console.log('[payments] reconcile: PI not yet succeeded —', pi.status);
      return { reconciled: false, alreadyPaid: false, piStatus: pi.status };
    }

    const applied = await this.applyPaymentSuccess(pi.id);
    console.log('[payments] reconcile: done — order PAID:', dto.orderId, '| applied by this call:', applied);
    // applied=false means a concurrent call (webhook or another reconcile) already did the work.
    return applied
      ? { reconciled: true, alreadyPaid: false }
      : { reconciled: false, alreadyPaid: true, status: OrderStatus.PAID };
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
