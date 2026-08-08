import { Body, Controller, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ProxyAwareThrottlerGuard } from '../common/proxy-aware-throttler.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // Rate-limited (per real client IP) admin login. Whitelist-validated body; uniform
  // error; never returns passwordHash.
  @Post('login')
  @HttpCode(200)
  @UseGuards(ProxyAwareThrottlerGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }
}
