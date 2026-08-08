import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Phase 11J (R1) — admin login credentials. Whitelisted so no extra field
// (role, id, disabledAt, …) can be injected.
export class AdminLoginDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}
