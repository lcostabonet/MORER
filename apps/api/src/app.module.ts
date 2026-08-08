import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth';
import { CartModule } from './cart';
import { CheckoutModule } from './checkout';
import { CustomersModule } from './customers/customers.module';
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
    AuthModule,
    AdminModule,
    CustomersModule,
  ],
})
export class AppModule {}
