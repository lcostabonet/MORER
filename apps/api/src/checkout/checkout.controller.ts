import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import type { CreateCheckoutFromCartDto } from './dto/create-checkout-from-cart.dto';

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('from-cart')
  startCheckout(@Body() body: CreateCheckoutFromCartDto) {
    return this.checkoutService.startCheckout(body);
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
