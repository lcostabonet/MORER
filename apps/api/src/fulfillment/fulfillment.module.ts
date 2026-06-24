import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { EmailModule } from '../email/email.module';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService],
})
export class FulfillmentModule {}
