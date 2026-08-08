import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { DatabaseModule } from '../database';
import { EmailModule } from '../email/email.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// AuthModule provides the 'jwt' Passport strategy used by OptionalJwtAuthGuard on the
// order-scoped payment routes (create-intent, reconcile, order/:orderId).
@Module({
  imports: [DatabaseModule, EmailModule, AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
