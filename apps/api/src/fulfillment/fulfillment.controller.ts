import { Body, Controller, Param, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AdminRole } from '@morer/database';
import { FulfillmentService } from './fulfillment.service';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminRoles } from '../admin/decorators/admin-roles.decorator';
// Value import (not `import type`): the ValidationPipe needs the DTO class at runtime.
import { ShipOrderDto } from './dto/ship-order.dto';

@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  /**
   * POST /fulfillment/orders/:orderId/ship
   * Marks the order as FULFILLED and records the tracking number.
   * Triggers the shipping confirmation email via EmailService.
   *
   * Phase 11J (R1) — authorized by a real ADMIN JWT (separate from customer auth) AND
   * an ADMIN/OPERATIONS role. A customer session, the guest order capability, and order
   * ownership grant NO fulfillment permission; an authenticated admin whose role is not
   * ADMIN/OPERATIONS is rejected with 403. The body is whitelist-validated.
   */
  @Post('orders/:orderId/ship')
  @UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN, AdminRole.OPERATIONS)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async shipOrder(
    @Param('orderId') orderId: string,
    @Body() dto: ShipOrderDto,
  ): Promise<{ orderId: string; status: string }> {
    return this.fulfillmentService.shipOrder(orderId, dto);
  }
}
