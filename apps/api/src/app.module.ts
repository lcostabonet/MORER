import { Module } from '@nestjs/common';
import { CartModule } from './cart';
import { HealthModule } from './health';
import { ProductsModule } from './products';

@Module({
  imports: [HealthModule, ProductsModule, CartModule],
})
export class AppModule {}
