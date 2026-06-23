import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database';
import { EmailModule } from '../email/email.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
