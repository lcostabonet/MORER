import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Trims whitespace but preserves the original casing — Customer.email keeps the
// casing the user typed, while the service derives the lowercase normalized form.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class EmailChangeRequestDto {
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  newEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword!: string;
}
