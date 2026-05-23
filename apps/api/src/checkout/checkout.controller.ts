import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import type { CreateCheckoutFromCartDto } from './dto/create-checkout-from-cart.dto';
import type { LookupOrderDto } from './dto/lookup-order.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('from-cart')
  startCheckout(@Body() body: CreateCheckoutFromCartDto) {
    return this.checkoutService.startCheckout(body);
  }

  @Post('orders/lookup')
  @HttpCode(200)
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
