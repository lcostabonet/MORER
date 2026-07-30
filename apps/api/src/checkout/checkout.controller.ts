import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CheckoutService } from './checkout.service';
import { CustomerCheckoutDto } from './dto/customer-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { CreateCheckoutFromCartDto } from './dto/create-checkout-from-cart.dto';
import type { LookupOrderDto } from './dto/lookup-order.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    sessionId: string;
  };
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  // ── Guest flow (unchanged, unauthenticated) ──────────────────────────────────

  @Post('from-cart')
  startCheckout(@Body() body: CreateCheckoutFromCartDto) {
    return this.checkoutService.startCheckout(body);
  }

  // ── Registered-customer flow (Phase 11E-alpha) ───────────────────────────────

  @Get('customer')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getCustomerCheckout(
    @Request() req: AuthenticatedRequest,
    @Query('cartId') cartId?: string,
  ) {
    return this.checkoutService.getCustomerCheckout(req.user.id, cartId);
  }

  @Post('customer/from-cart')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  startCustomerCheckout(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CustomerCheckoutDto,
  ) {
    return this.checkoutService.startCustomerCheckout(
      req.user.id,
      req.user.email,
      dto,
    );
  }

  @Post('orders/lookup')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  lookupOrder(@Body() body: LookupOrderDto) {
    return this.checkoutService.lookupOrder(body);
  }

  @Get('orders/:orderId')
  findOrder(@Param('orderId') orderId: string) {
    return this.checkoutService.findOrder(orderId);
  }

  @Post('orders/:orderId/cancel')
  cancelOrder(@Param('orderId') orderId: string) {
    return this.checkoutService.cancelOrder(orderId);
  }
}
