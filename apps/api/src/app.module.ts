import { Module } from '@nestjs/common';
import { CartModule } from './cart';
import { CheckoutModule } from './checkout';
import { HealthModule } from './health';
import { ProductsModule } from './products';

@Module({
  imports: [HealthModule, ProductsModule, CartModule, CheckoutModule],
})
export class AppModule {}
