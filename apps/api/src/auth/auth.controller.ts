import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    sessionId: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Get('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.id);
  }

  @Patch('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  // whitelist strips any non-DTO property (id, email, passwordHash, …) from the
  // body before it reaches the service — the authenticated id comes only from req.user.
  @UsePipes(new ValidationPipe({ whitelist: true }))
  updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.id, dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: AuthenticatedRequest) {
    await this.authService.logout(req.user.id, req.user.sessionId);
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@Request() req: AuthenticatedRequest) {
    await this.authService.logoutAll(req.user.id);
    return { success: true };
  }

  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    try {
      await this.authService.forgotPassword(dto.email);
    } catch {
      // swallow — always return generic response
    }
    return {
      success: true,
      message:
        'Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer la contraseña.',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async resetPassword(@Body() dto: ResetPasswordDto) {
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }
    await this.authService.resetPassword(dto.token, dto.password);
    return { success: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 10 } })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return { success: true };
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 3 } })
  async resendVerification(@Request() req: AuthenticatedRequest) {
    try {
      await this.authService.resendVerification(req.user.id);
    } catch {
      // Never expose provider / token internals — always return the generic message.
    }
    return {
      success: true,
      message:
        'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.',
    };
  }
}
