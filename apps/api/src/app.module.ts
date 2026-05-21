import { Module } from '@nestjs/common';
import { CartModule } from './cart';
import { CheckoutModule } from './checkout';
import { HealthModule } from './health';
import { PaymentsModule } from './payments';
import { ProductsModule } from './products';

@Module({
  imports: [HealthModule, ProductsModule, CartModule, CheckoutModule, PaymentsModule],
})
export class AppModule {}
