import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { SHIPPING_METHOD_CODES } from '../shipping-methods';

// Registered-customer checkout from saved addresses. customerId is NEVER part of
// this DTO — it comes only from the validated JWT. Whitelisting strips any extra
// property. Only address selection + the cart identifier are accepted.
export class CustomerCheckoutDto {
  @IsUUID()
  cartId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  shippingAddressId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  billingAddressId?: string;

  @IsOptional()
  @IsBoolean()
  useShippingAsBilling?: boolean;

  // Only the method CODE is accepted — never a price. Backend re-prices against
  // the real cart subtotal. Optional: defaults to STANDARD for compatibility.
  @IsOptional()
  @IsIn([...SHIPPING_METHOD_CODES])
  shippingMethodCode?: string;
}
