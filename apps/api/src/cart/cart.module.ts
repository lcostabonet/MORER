import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
