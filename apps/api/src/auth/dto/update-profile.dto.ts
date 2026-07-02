import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Trims string values; leaves non-strings untouched so type validation still runs.
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Only firstName, lastName and phone are editable. Any other property in the
// body (id, email, passwordHash, emailVerifiedAt, …) is stripped by the
// controller's whitelisting ValidationPipe and never reaches the service.
export class UpdateProfileDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(100)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Los apellidos son obligatorios.' })
  @MaxLength(100)
  lastName!: string;

  // Optional. Raw input is capped here; the service normalizes it via
  // normalizePhone() and rejects invalid formats with a controlled 400.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}
