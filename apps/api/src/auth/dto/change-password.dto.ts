import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

// Passwords are opaque values: NO @Transform (no trim/normalize). The 8–72 rule
// mirrors register.dto and reset-password.dto exactly (72 also guards against
// bcrypt's effective byte limit — oversized input is rejected, never truncated).
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
