import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import type { ShipOrderDto } from './dto/ship-order.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: unknown, field: string): void {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID`);
  }
}

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Marks an order as FULFILLED, records the tracking number (and optional URL),
   * then triggers the shipping confirmation email.
   *
   * State machine:
   *   PAID → FULFILLED: normal flow — updates status + tracking, sends email.
   *   FULFILLED + shippingEmailSentAt IS NULL: email retry — sends email only
   *     (tracking must match; status and tracking fields are NOT updated again).
   *   FULFILLED + shippingEmailSentAt IS NOT NULL: idempotent success — returns
   *     immediately without any DB write or email attempt.
   *   FULFILLED + different trackingNumber: rejected with 400 (tracking conflict).
   *   Any other status: rejected with 400.
   *
   * The email send never blocks a status change — EmailService catches all provider
   * errors internally, so fulfillment is never rolled back on email failure.
   */
  async shipOrder(orderId: string, dto: ShipOrderDto): Promise<{ orderId: string; status: string }> {
    assertUuid(orderId, 'orderId');

    if (!dto.trackingNumber || dto.trackingNumber.trim() === '') {
      throw new BadRequestException('trackingNumber must be a non-empty string');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        shippingEmailSentAt: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.FULFILLED) {
      // Guard: tracking conflict — different tracking number provided after fulfillment.
      if (order.trackingNumber !== dto.trackingNumber.trim()) {
        throw new BadRequestException(
          `Order ${orderId} is already fulfilled with a different tracking number. Tracking already set with a different value.`,
        );
      }

      // Idempotent: shipping email already sent — nothing to do.
      if (order.shippingEmailSentAt !== null) {
        return { orderId, status: OrderStatus.FULFILLED };
      }

      // Email retry path: order is FULFILLED but email was never sent (e.g. provider
      // error on first attempt). Re-trigger the email without touching status or tracking.
      console.log(`[fulfillment] Order ${orderId} already FULFILLED — retrying shipping email`);
      await this.emailService.sendShippingConfirmationIfNeeded(orderId);
      return { orderId, status: OrderStatus.FULFILLED };
    }

    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        `Order ${orderId} cannot be shipped (status: ${order.status}). Only PAID orders can be fulfilled.`,
      );
    }

    // Phase 11J — atomic claim: the transition happens in a single conditional write
    // guarded by `status: PAID`, so under concurrency exactly ONE caller flips
    // PAID → FULFILLED (count === 1). A racing caller sees count === 0 and returns the
    // already-fulfilled result without a second effect — no in-memory lock, no double
    // transition. The DB write commits BEFORE the email (which is idempotent and never
    // rolls the status back), so a temporary email failure leaves a retryable FULFILLED.
    const claim = await this.prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.PAID },
      data: {
        status: OrderStatus.FULFILLED,
        trackingNumber: dto.trackingNumber.trim(),
        trackingUrl: dto.trackingUrl?.trim() ?? null,
      },
    });

    if (claim.count === 0) {
      // Lost the race — a concurrent ship already moved the order out of PAID.
      console.log(`[fulfillment] Order ${orderId} already claimed by a concurrent ship — no second transition`);
      return { orderId, status: OrderStatus.FULFILLED };
    }

    console.log(`[fulfillment] Order ${orderId} marked as FULFILLED — tracking: ${dto.trackingNumber}`);

    // Send shipping confirmation email. EmailService uses shippingEmailSentAt for idempotency
    // and catches all provider errors — fulfillment status is never rolled back on email failure.
    await this.emailService.sendShippingConfirmationIfNeeded(orderId);

    return { orderId, status: OrderStatus.FULFILLED };
  }
}
