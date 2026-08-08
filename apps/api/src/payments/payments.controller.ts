import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { ReconcilePaymentDto } from './dto/reconcile-payment.dto';

// The OptionalJwtAuthGuard leaves `user` undefined for guests.
interface OptionalAuthRequest {
  user?: { id: string };
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Every order-scoped payment route is authorized by the JWT owner (registered
  // order) or a valid guest capability (X-Order-Access-Token). The Stripe webhook is
  // deliberately excluded — it is authorized by signature, never by user credentials.
  @Post('create-intent')
  @UseGuards(OptionalJwtAuthGuard)
  createIntent(
    @Body() body: CreatePaymentIntentDto,
    @Req() req: OptionalAuthRequest,
    @Headers('x-order-access-token') accessToken?: string,
  ) {
    return this.paymentsService.createPaymentIntent(body, {
      userId: req.user?.id,
      token: accessToken,
    });
  }

  @Post('reconcile')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  reconcile(
    @Body() body: ReconcilePaymentDto,
    @Req() req: OptionalAuthRequest,
    @Headers('x-order-access-token') accessToken?: string,
  ) {
    return this.paymentsService.reconcilePayment(body, {
      userId: req.user?.id,
      token: accessToken,
    });
  }

  @Post('webhook/stripe')
  @HttpCode(200)
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleStripeWebhook(req.rawBody, signature);
  }

  @Get('order/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  findByOrder(
    @Param('orderId') orderId: string,
    @Req() req: OptionalAuthRequest,
    @Headers('x-order-access-token') accessToken?: string,
  ) {
    return this.paymentsService.findPaymentsByOrder(orderId, {
      userId: req.user?.id,
      token: accessToken,
    });
  }
}
