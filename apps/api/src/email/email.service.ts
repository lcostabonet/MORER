import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@morer/database';
import { Resend } from 'resend';
import { renderOrderConfirmation, renderShippingConfirmation } from '@morer/emails';
import { PrismaService } from '../database/prisma.service';

const CURRENCY = 'EUR';

// Minimal shape returned by the order query inside this service.
type OrderWithItems = {
  id: string;
  orderNumber: string;
  status: string;
  email: string | null;
  totalInCents: number;
  confirmationEmailSentAt: Date | null;
  items: Array<{
    productName: string;
    variantSize: string;
    quantity: number;
    priceInCents: number;
  }>;
};

// Minimal shape for the shipping email query.
type OrderForShipping = {
  id: string;
  orderNumber: string;
  status: string;
  email: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippingEmailSentAt: Date | null;
  shippingEmailSendingAt: Date | null;
  items: Array<{
    productName: string;
    variantSize: string;
    quantity: number;
  }>;
};

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY is required for EmailService');
    }
    this.resend = new Resend(key);
    this.fromAddress = process.env.EMAIL_FROM ?? 'noreply@morer.com';
  }

  /**
   * Sends the order_confirmation email for a PAID order, if not already sent.
   *
   * Idempotent: checks Order.confirmationEmailSentAt before sending.
   * A failure from the email provider is logged but never rethrows — the payment
   * must remain confirmed regardless of email delivery.
   * The column is only marked after the provider accepts the request, so a crash
   * or provider failure leaves the column null and the next webhook retry can
   * attempt the send again.
   */
  async sendOrderConfirmationIfNeeded(orderId: string): Promise<void> {
    let order: OrderWithItems | null;
    try {
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      }) as OrderWithItems | null;
    } catch (err) {
      console.error(`[email] Failed to load order ${orderId} for confirmation email:`, err);
      return;
    }

    if (!order) {
      console.log(`[email] Order ${orderId} not found — skipping confirmation email`);
      return;
    }

    if (order.status !== OrderStatus.PAID) {
      return;
    }

    if (order.confirmationEmailSentAt) {
      return;
    }

    if (!order.email) {
      // Legacy orders created before Phase 9D-alpha may have no email.
      console.log(`[email] Order ${orderId} has no email address — skipping confirmation`);
      return;
    }

    try {
      const html = await renderOrderConfirmation({
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          productName: item.productName,
          variantSize: item.variantSize,
          quantity: item.quantity,
          priceInCents: item.priceInCents,
        })),
        totalInCents: order.totalInCents,
        currency: CURRENCY,
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: order.email,
        subject: `Confirmación de tu pedido ${order.orderNumber}`,
        html,
      });

      if (error) {
        throw error;
      }

      // Mark only after the provider accepts the request.
      // updateMany with confirmationEmailSentAt: null guard is a no-op if a
      // concurrent call already marked the column (prevents double-mark without
      // error, since updateMany never throws on 0 rows updated).
      await this.prisma.order.updateMany({
        where: { id: orderId, confirmationEmailSentAt: null },
        data: { confirmationEmailSentAt: new Date() },
      });

      console.log(`[email] Order confirmation sent — order: ${orderId}`);
    } catch (err) {
      // Email failure must not affect payment status.
      // The column stays null so the next webhook retry can attempt again.
      console.error(`[email] Failed to send order confirmation for order ${orderId}:`, err);
    }
  }

  /**
   * Sends the shipping_confirmation email for a FULFILLED order, if not already sent.
   *
   * Uses an atomic DB claim (shippingEmailSendingAt) to prevent concurrent callers
   * from both reaching the Resend call. Only the caller whose updateMany claim wins
   * (count === 1) proceeds to send. Stale claims older than 5 minutes are recovered
   * to allow retry after a process crash.
   *
   * A failure from the email provider is logged but never rethrows — the fulfillment
   * status must remain unchanged regardless of email delivery.
   * On any failure the claim is released (shippingEmailSendingAt reset to null)
   * so a future retry can reclaim it.
   */
  async sendShippingConfirmationIfNeeded(orderId: string): Promise<void> {
    let order: OrderForShipping | null;
    try {
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          email: true,
          trackingNumber: true,
          trackingUrl: true,
          shippingEmailSentAt: true,
          shippingEmailSendingAt: true,
          items: {
            select: {
              productName: true,
              variantSize: true,
              quantity: true,
            },
          },
        },
      }) as OrderForShipping | null;
    } catch (err) {
      console.error(`[email] Failed to load order ${orderId} for shipping email:`, err);
      return;
    }

    // Pre-send guards (cheap reads, no DB write)
    if (!order) {
      console.log(`[email] Order ${orderId} not found — skipping shipping email`);
      return;
    }

    if (order.status !== OrderStatus.FULFILLED) {
      return;
    }

    if (order.shippingEmailSentAt !== null) {
      return;
    }

    if (!order.email) {
      console.log(`[email] Order ${orderId} has no email address — skipping shipping email`);
      return;
    }

    if (!order.trackingNumber) {
      console.log(`[email] Order ${orderId} has no tracking number — skipping shipping email`);
      return;
    }

    // Atomic claim — only one concurrent caller wins.
    // claimedAt is captured once and used in all subsequent WHERE clauses so that
    // a revived old process (whose claimedAt differs from the current DB value)
    // cannot release or complete another process's claim.
    // Stale claims older than 5 minutes are recovered to allow retry after process crash.
    const STALE_MS = 5 * 60 * 1000;
    const staleThreshold = new Date(Date.now() - STALE_MS);
    const claimedAt = new Date();
    const claim = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        shippingEmailSentAt: null,
        OR: [
          { shippingEmailSendingAt: null },
          { shippingEmailSendingAt: { lt: staleThreshold } },
        ],
      },
      data: { shippingEmailSendingAt: claimedAt },
    });

    if (claim.count === 0) {
      // Another caller claimed it (or it was already sent)
      return;
    }

    // Send — no open DB transaction during external call
    try {
      const html = await renderShippingConfirmation({
        orderNumber: order.orderNumber,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl ?? undefined,
        items: order.items.map((item) => ({
          productName: item.productName,
          variantSize: item.variantSize,
          quantity: item.quantity,
        })),
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: order.email,
        subject: `Tu pedido ${order.orderNumber} está en camino`,
        html,
      });

      if (error) {
        console.error(`[email] Provider error sending shipping email for order ${orderId}:`, error);
        // Release claim — only if we still own it (claimedAt guard).
        await this.prisma.order.updateMany({
          where: { id: orderId, shippingEmailSentAt: null, shippingEmailSendingAt: claimedAt },
          data: { shippingEmailSendingAt: null },
        });
        return;
      }

      // Mark sent and release claim — only if we still own it (claimedAt guard).
      await this.prisma.order.updateMany({
        where: { id: orderId, shippingEmailSentAt: null, shippingEmailSendingAt: claimedAt },
        data: { shippingEmailSentAt: new Date(), shippingEmailSendingAt: null },
      });

      console.log(`[email] Shipping confirmation sent — order: ${orderId}`);
    } catch (err) {
      // Email failure must not affect fulfillment status.
      console.error(`[email] Failed to send shipping confirmation for order ${orderId}:`, err);
      // Release claim on unexpected error — only if we still own it (claimedAt guard).
      await this.prisma.order.updateMany({
        where: { id: orderId, shippingEmailSentAt: null, shippingEmailSendingAt: claimedAt },
        data: { shippingEmailSendingAt: null },
      });
    }
  }
}
