import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import type { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import type { ReconcilePaymentDto } from './dto/reconcile-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-intent')
  createIntent(@Body() body: CreatePaymentIntentDto) {
    return this.paymentsService.createPaymentIntent(body);
  }

  @Post('reconcile')
  @HttpCode(200)
  reconcile(@Body() body: ReconcilePaymentDto) {
    return this.paymentsService.reconcilePayment(body);
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
  findByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.findPaymentsByOrder(orderId);
  }
}
