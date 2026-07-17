import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { DatabaseModule } from '../database';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

// AuthModule is imported so the 'jwt' Passport strategy (JwtStrategy) is
// available to JwtAuthGuard on this module's routes.
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class CustomersModule {}
