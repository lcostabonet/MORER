import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CustomerAddressType } from '@morer/database';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAddressDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  // Optional. Normalized by the service (empty -> null; invalid -> 400).
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  line2?: string | null;

  @Transform(trim)
  @IsString()
  @Matches(/^\d{5}$/, { message: 'El código postal debe tener 5 dígitos.' })
  postalCode!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province!: string;

  // Only Spain is accepted for now — the service rejects any other value.
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsEnum(CustomerAddressType)
  type!: CustomerAddressType;

  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean;
}
