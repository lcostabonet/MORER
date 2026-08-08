import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { DatabaseModule } from '../database';
import { EmailModule } from '../email/email.module';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';

// AdminModule provides the 'admin-jwt' strategy + AdminRolesGuard used to authorize
// the ops-only /ship endpoint (Phase 11J).
@Module({
  imports: [DatabaseModule, EmailModule, AdminModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService],
})
export class FulfillmentModule {}
