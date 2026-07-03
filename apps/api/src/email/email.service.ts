import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@morer/database';
import { Resend } from 'resend';
import { renderConfirmEmailChange, renderEmailChangedNotice, renderOrderConfirmation, renderPasswordChangedNotice, renderPasswordReset, renderShippingConfirmation, renderVerifyEmail, renderWelcome } from '@morer/emails';
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

// Minimal shape for the welcome email query.
type CustomerForWelcome = {
  id: string;
  email: string;
  firstName: string | null;
  passwordHash: string | null;
  registeredAt: Date | null;
  welcomeEmailSentAt: Date | null;
  welcomeEmailSendingAt: Date | null;
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

  /**
   * Sends the welcome email for a newly registered customer, if not already sent.
   *
   * Only sends to customers who have a passwordHash and registeredAt (i.e. real
   * registered accounts, not anonymous checkout guests). Anonymous email addresses
   * matching the "anon-" prefix or "@morer-checkout.local" domain are skipped.
   *
   * Uses the same atomic DB claim pattern as sendShippingConfirmationIfNeeded:
   * only the caller whose updateMany wins (count === 1) proceeds to send. Stale
   * claims older than 5 minutes are recovered to allow retry after a process crash.
   *
   * A failure from the email provider is logged but never rethrows — the customer
   * registration status must remain unchanged regardless of email delivery.
   * On any failure the claim is released (welcomeEmailSendingAt reset to null)
   * so a future retry can reclaim it.
   */
  async sendWelcomeEmailIfNeeded(customerId: string): Promise<void> {
    let customer: CustomerForWelcome | null;
    try {
      customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          email: true,
          firstName: true,
          passwordHash: true,
          registeredAt: true,
          welcomeEmailSentAt: true,
          welcomeEmailSendingAt: true,
        },
      }) as CustomerForWelcome | null;
    } catch (err) {
      console.error(`[email] Failed to load customer ${customerId} for welcome email:`, err);
      return;
    }

    // Pre-send guards (cheap reads, no DB write)
    if (!customer) {
      console.log(`[email] Customer ${customerId} not found — skipping welcome email`);
      return;
    }

    if (!customer.passwordHash) {
      // Anonymous / guest customer — no registered account.
      return;
    }

    if (!customer.registeredAt) {
      // Not yet fully registered.
      return;
    }

    if (
      /^anon-/i.test(customer.email) ||
      customer.email.endsWith('@morer-checkout.local')
    ) {
      console.log(`[email] Customer ${customerId} has a synthetic email address — skipping welcome email`);
      return;
    }

    if (customer.welcomeEmailSentAt !== null) {
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
    const claim = await this.prisma.customer.updateMany({
      where: {
        id: customerId,
        welcomeEmailSentAt: null,
        passwordHash: { not: null },
        registeredAt: { not: null },
        OR: [
          { welcomeEmailSendingAt: null },
          { welcomeEmailSendingAt: { lt: staleThreshold } },
        ],
      },
      data: { welcomeEmailSendingAt: claimedAt },
    });

    if (claim.count === 0) {
      // Another caller claimed it (or it was already sent)
      return;
    }

    // Send — no open DB transaction during external call
    try {
      const webUrl = process.env.WEB_URL ?? 'https://morer.com';
      const html = await renderWelcome({
        firstName: customer.firstName,
        webUrl,
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: customer.email,
        subject: 'Te damos la bienvenida a MORER',
        html,
      });

      if (error) {
        console.error(`[email] Provider error sending welcome email for customer ${customerId}:`, error);
        // Release claim — only if we still own it (claimedAt guard).
        await this.prisma.customer.updateMany({
          where: { id: customerId, welcomeEmailSentAt: null, welcomeEmailSendingAt: claimedAt },
          data: { welcomeEmailSendingAt: null },
        });
        return;
      }

      // Mark sent and release claim — only if we still own it (claimedAt guard).
      await this.prisma.customer.updateMany({
        where: { id: customerId, welcomeEmailSentAt: null, welcomeEmailSendingAt: claimedAt },
        data: { welcomeEmailSentAt: new Date(), welcomeEmailSendingAt: null },
      });

      console.log(`[email] Welcome email sent — customer: ${customerId}`);
    } catch (err) {
      // Email failure must not affect registration status.
      console.error(`[email] Failed to send welcome email for customer ${customerId}:`, err);
      // Release claim on unexpected error — only if we still own it (claimedAt guard).
      await this.prisma.customer.updateMany({
        where: { id: customerId, welcomeEmailSentAt: null, welcomeEmailSendingAt: claimedAt },
        data: { welcomeEmailSendingAt: null },
      });
    }
  }

  /**
   * Sends a password-reset email to the customer.
   *
   * Does NOT use an atomic claim — each forgot-password request intentionally
   * replaces the previous token, so there is no need to deduplicate sends.
   * Failures are logged but never rethrown so the caller always gets a
   * consistent (silent) response regardless of email delivery.
   *
   * Never logs PII: email, firstName, resetUrl, or the raw token are excluded
   * from all log lines.
   */
  async sendPasswordResetEmail(params: {
    customerId: string;
    email: string;
    firstName: string | null;
    resetUrl: string;
  }): Promise<void> {
    try {
      const html = await renderPasswordReset({
        firstName: params.firstName,
        resetUrl: params.resetUrl,
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.email,
        subject: 'Restablece tu contraseña de MORER',
        html,
      });

      if (error) {
        const code = (error as unknown as Record<string, unknown>)['name'] ?? 'UNKNOWN';
        console.warn(`[email] Provider error sending password-reset email`, {
          customerId: params.customerId,
          code,
        });
        return;
      }

      console.log(`[email] Password-reset email sent — customer: ${params.customerId}`);
    } catch (err) {
      const code =
        err instanceof Error ? err.name : 'UNKNOWN';
      console.warn(`[email] Failed to send password-reset email`, {
        customerId: params.customerId,
        code,
      });
    }
  }

  /**
   * Sends an email-verification email to the customer.
   *
   * Does NOT use an atomic claim — each register/resend intentionally replaces
   * the previous token (upsert in AuthService), so there is no need to
   * deduplicate sends. Failures are logged but never rethrown so the caller
   * always gets a consistent response regardless of email delivery.
   *
   * Never logs PII: email, firstName, verifyUrl, or the raw token are excluded
   * from all log lines.
   */
  async sendVerificationEmail(params: {
    customerId: string;
    email: string;
    firstName: string | null;
    verifyUrl: string;
  }): Promise<void> {
    try {
      const html = await renderVerifyEmail({
        firstName: params.firstName,
        verifyUrl: params.verifyUrl,
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.email,
        subject: 'Verifica tu correo de MORER',
        html,
      });

      if (error) {
        const code = (error as unknown as Record<string, unknown>)['name'] ?? 'UNKNOWN';
        console.warn(`[email] Provider error sending verification email`, {
          customerId: params.customerId,
          code,
        });
        return;
      }

      console.log(`[email] Verification email sent — customer: ${params.customerId}`);
    } catch (err) {
      const code = err instanceof Error ? err.name : 'UNKNOWN';
      console.warn(`[email] Failed to send verification email`, {
        customerId: params.customerId,
        code,
      });
    }
  }

  /**
   * Sends the email-change confirmation to the NEW address.
   *
   * Unlike the other transactional emails, this one RE-THROWS on failure: the
   * caller (AuthService.requestEmailChange) needs to know delivery failed so it
   * can roll back the just-created pending request. Never logs PII: only a
   * customerId and a coarse error code appear in logs.
   */
  async sendEmailChangeConfirmation(params: {
    customerId: string;
    newEmail: string;
    confirmUrl: string;
  }): Promise<void> {
    try {
      const html = await renderConfirmEmailChange({ confirmUrl: params.confirmUrl });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.newEmail,
        subject: 'Confirma tu nuevo correo de MORER',
        html,
      });

      if (error) {
        const code = (error as unknown as Record<string, unknown>)['name'] ?? 'UNKNOWN';
        console.warn(`[email] Provider error sending email-change confirmation`, {
          customerId: params.customerId,
          code,
        });
        throw new Error('email-change-confirmation-send-failed');
      }

      console.log(`[email] Email-change confirmation sent — customer: ${params.customerId}`);
    } catch (err) {
      const code = err instanceof Error ? err.name : 'UNKNOWN';
      console.warn(`[email] Failed to send email-change confirmation`, {
        customerId: params.customerId,
        code,
      });
      throw err instanceof Error ? err : new Error('email-change-confirmation-send-failed');
    }
  }

  /**
   * Best-effort security notice to the OLD address after an email change is
   * confirmed. Failures are swallowed (logged only) — the change is already
   * committed and must not be reverted. The new address is masked in the body;
   * no token, password, hash, id or login link is ever included.
   */
  async sendEmailChangedNotice(params: {
    customerId: string;
    oldEmail: string;
    newEmail: string;
  }): Promise<void> {
    try {
      const html = await renderEmailChangedNotice({
        maskedNewEmail: maskEmail(params.newEmail),
      });

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.oldEmail,
        subject: 'El correo de tu cuenta MORER ha cambiado',
        html,
      });

      if (error) {
        const code = (error as unknown as Record<string, unknown>)['name'] ?? 'UNKNOWN';
        console.warn(`[email] Provider error sending email-changed notice`, {
          customerId: params.customerId,
          code,
        });
        return;
      }

      console.log(`[email] Email-changed notice sent — customer: ${params.customerId}`);
    } catch (err) {
      const code = err instanceof Error ? err.name : 'UNKNOWN';
      console.warn(`[email] Failed to send email-changed notice`, {
        customerId: params.customerId,
        code,
      });
    }
  }

  /**
   * Best-effort notice to the customer's current address after a password
   * change. Failures are swallowed (logged only) — the change is already
   * committed and must not be reverted. The email body carries no password,
   * hash, token, id or login link; logs never include the address.
   */
  async sendPasswordChangedNotice(params: {
    customerId: string;
    email: string;
  }): Promise<void> {
    try {
      const html = await renderPasswordChangedNotice();

      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: params.email,
        subject: 'La contraseña de tu cuenta MORER ha cambiado',
        html,
      });

      if (error) {
        const code = (error as unknown as Record<string, unknown>)['name'] ?? 'UNKNOWN';
        console.warn(`[email] Provider error sending password-changed notice`, {
          customerId: params.customerId,
          code,
        });
        return;
      }

      console.log(`[email] Password-changed notice sent — customer: ${params.customerId}`);
    } catch (err) {
      const code = err instanceof Error ? err.name : 'UNKNOWN';
      console.warn(`[email] Failed to send password-changed notice`, {
        customerId: params.customerId,
        code,
      });
    }
  }
}

// Partially masks an email address for display in the change notice, e.g.
// "nuevo@example.com" -> "n***@example.com". Never reveals the full address.
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}***@${domain}`;
}
