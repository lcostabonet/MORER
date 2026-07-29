import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { DatabaseModule } from '../database';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

// AuthModule provides the 'jwt' Passport strategy used by JwtAuthGuard on the
// authenticated customer-checkout routes.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
