import { Controller, Get, NotFoundException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return this.healthService.getStatus();
  }

  @Get('database')
  async getDatabaseHealth() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isExposed = process.env.EXPOSE_DATABASE_HEALTH === 'true';

    if (isProduction && !isExposed) {
      throw new NotFoundException();
    }

    return this.healthService.getDatabaseStatus();
  }
}
