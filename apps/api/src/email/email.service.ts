import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@morer/database';
import { Resend } from 'resend';
import { renderOrderConfirmation } from '@morer/emails';
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
}
