import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProxyAwareThrottlerGuard } from '../common/proxy-aware-throttler.guard';
import { CheckoutService } from './checkout.service';
import { CustomerCheckoutDto } from './dto/customer-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
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

// The OptionalJwtAuthGuard leaves `user` undefined for guests (no/invalid token).
interface OptionalAuthRequest {
  user?: { id: string };
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
  @UseGuards(ProxyAwareThrottlerGuard)
  lookupOrder(@Body() body: LookupOrderDto) {
    return this.checkoutService.lookupOrder(body);
  }

  // Reading an order requires ownership: the JWT owner (registered orders) or a valid
  // guest capability (X-Order-Access-Token). Unauthorized callers get a uniform 404.
  @Get('orders/:orderId')
  @UseGuards(OptionalJwtAuthGuard)
  findOrder(
    @Param('orderId') orderId: string,
    @Request() req: OptionalAuthRequest,
    @Headers('x-order-access-token') accessToken?: string,
  ) {
    return this.checkoutService.findOrder(orderId, {
      userId: req.user?.id,
      token: accessToken,
    });
  }

  // Cancelling is a sensitive mutation — same ownership requirement as reading.
  @Post('orders/:orderId/cancel')
  @UseGuards(OptionalJwtAuthGuard)
  cancelOrder(
    @Param('orderId') orderId: string,
    @Request() req: OptionalAuthRequest,
    @Headers('x-order-access-token') accessToken?: string,
  ) {
    return this.checkoutService.cancelOrder(orderId, {
      userId: req.user?.id,
      token: accessToken,
    });
  }
}
