import { Body, Controller, Param, Post } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import type { ShipOrderDto } from './dto/ship-order.dto';

// TODO: protect with admin auth guard when auth module is complete
@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  /**
   * POST /fulfillment/orders/:orderId/ship
   * Marks the order as FULFILLED and records the tracking number.
   * Triggers the shipping confirmation email via EmailService.
   */
  @Post('orders/:orderId/ship')
  async shipOrder(
    @Param('orderId') orderId: string,
    @Body() dto: ShipOrderDto,
  ): Promise<{ orderId: string; status: string }> {
    return this.fulfillmentService.shipOrder(orderId, dto);
  }
}
