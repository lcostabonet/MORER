import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CartModule } from './cart';
import { CheckoutModule } from './checkout';
import { FulfillmentModule } from './fulfillment';
import { HealthModule } from './health';
import { PaymentsModule } from './payments';
import { ProductsModule } from './products';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    HealthModule,
    ProductsModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    FulfillmentModule,
  ],
})
export class AppModule {}
