import { Module } from '@nestjs/common';
import { HealthModule } from './health';
import { ProductsModule } from './products';

@Module({
  imports: [HealthModule, ProductsModule],
})
export class AppModule {}
