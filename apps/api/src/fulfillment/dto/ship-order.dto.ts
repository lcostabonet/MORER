import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Phase 11I: validated so a ValidationPipe({ whitelist, forbidNonWhitelisted }) can
// strip/reject any field that is not part of the shipping contract (mass-assignment
// defense) and bound the tracking inputs (length + http(s)-only URL, so a stored URL
// cannot carry a javascript:/data: payload when later rendered as a link).
export class ShipOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/.+/i, { message: 'trackingUrl must be an http(s) URL' })
  trackingUrl?: string;
}
