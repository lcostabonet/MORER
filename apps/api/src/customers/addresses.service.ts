import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerAddressType, Prisma } from '@morer/database';
import { PrismaService } from '../database/prisma.service';
import { normalizePhone } from '../auth/phone.util';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';

// Public projection — never exposes customerId or any internal-only field.
const ADDRESS_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  line1: true,
  line2: true,
  postalCode: true,
  city: true,
  province: true,
  countryCode: true,
  type: true,
  isDefaultShipping: true,
  isDefaultBilling: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerAddressSelect;

const ONLY_SPAIN = 'Por ahora solo se admiten direcciones de España.';
const SHIPPING_NOT_BILLING =
  'Una dirección de envío no puede ser predeterminada de facturación.';
const BILLING_NOT_SHIPPING =
  'Una dirección de facturación no puede ser predeterminada de envío.';
const PHONE_INVALID =
  'Introduce un teléfono internacional válido, por ejemplo +34 612 345 678.';
const NOT_FOUND = 'Dirección no encontrada.';
const DEFAULT_CONFLICT =
  'No se ha podido actualizar la dirección predeterminada. Inténtalo de nuevo.';

function canBeDefaultShipping(type: CustomerAddressType): boolean {
  return type === CustomerAddressType.SHIPPING || type === CustomerAddressType.BOTH;
}
function canBeDefaultBilling(type: CustomerAddressType): boolean {
  return type === CustomerAddressType.BILLING || type === CustomerAddressType.BOTH;
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'P2002'
  );
}

// Optional free-text field: trim; empty -> null.
function normalizeOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of the authenticated customer's addresses, in a stable order. */
  async list(customerId: string) {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ADDRESS_SELECT,
    });
  }

  async create(customerId: string, dto: CreateAddressDto) {
    if ((dto.countryCode ?? 'ES') !== 'ES') {
      throw new BadRequestException(ONLY_SPAIN);
    }

    const type = dto.type;
    // Explicitly requesting an incompatible default is a hard error.
    if (dto.isDefaultBilling === true && !canBeDefaultBilling(type)) {
      throw new BadRequestException(SHIPPING_NOT_BILLING);
    }
    if (dto.isDefaultShipping === true && !canBeDefaultShipping(type)) {
      throw new BadRequestException(BILLING_NOT_SHIPPING);
    }

    const phoneResult = normalizePhone(dto.phone);
    if (!phoneResult.ok) throw new BadRequestException(PHONE_INVALID);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingShipping = await tx.customerAddress.findFirst({
          where: { customerId, isDefaultShipping: true },
          select: { id: true },
        });
        const existingBilling = await tx.customerAddress.findFirst({
          where: { customerId, isDefaultBilling: true },
          select: { id: true },
        });

        // First compatible address of a kind becomes the default automatically.
        const setShipping =
          canBeDefaultShipping(type) &&
          (dto.isDefaultShipping === true || existingShipping === null);
        const setBilling =
          canBeDefaultBilling(type) &&
          (dto.isDefaultBilling === true || existingBilling === null);

        if (setShipping && existingShipping) {
          await tx.customerAddress.updateMany({
            where: { customerId, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
        }
        if (setBilling && existingBilling) {
          await tx.customerAddress.updateMany({
            where: { customerId, isDefaultBilling: true },
            data: { isDefaultBilling: false },
          });
        }

        return tx.customerAddress.create({
          data: {
            customerId,
            fullName: dto.fullName,
            phone: phoneResult.value,
            line1: dto.line1,
            line2: normalizeOptional(dto.line2),
            postalCode: dto.postalCode,
            city: dto.city,
            province: dto.province,
            countryCode: 'ES',
            type,
            isDefaultShipping: setShipping,
            isDefaultBilling: setBilling,
          },
          select: ADDRESS_SELECT,
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException(DEFAULT_CONFLICT);
      }
      throw err;
    }
  }

  async update(customerId: string, addressId: string, dto: UpdateAddressDto) {
    if (dto.countryCode !== undefined && dto.countryCode !== 'ES') {
      throw new BadRequestException(ONLY_SPAIN);
    }

    const phoneProvided = dto.phone !== undefined;
    let phoneValue: string | null = null;
    if (phoneProvided) {
      const r = normalizePhone(dto.phone);
      if (!r.ok) throw new BadRequestException(PHONE_INVALID);
      phoneValue = r.value;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.customerAddress.findFirst({
          where: { id: addressId, customerId },
        });
        if (!existing) throw new NotFoundException(NOT_FOUND);

        const newType = dto.type ?? existing.type;

        // Explicit incompatible default request → hard error.
        if (dto.isDefaultShipping === true && !canBeDefaultShipping(newType)) {
          throw new BadRequestException(BILLING_NOT_SHIPPING);
        }
        if (dto.isDefaultBilling === true && !canBeDefaultBilling(newType)) {
          throw new BadRequestException(SHIPPING_NOT_BILLING);
        }

        let finalShipping = dto.isDefaultShipping ?? existing.isDefaultShipping;
        let finalBilling = dto.isDefaultBilling ?? existing.isDefaultBilling;
        // A type change that makes a carried-over default incompatible clears it.
        if (finalShipping && !canBeDefaultShipping(newType)) finalShipping = false;
        if (finalBilling && !canBeDefaultBilling(newType)) finalBilling = false;

        // Becoming a default clears the previous one for this customer.
        if (finalShipping && !existing.isDefaultShipping) {
          await tx.customerAddress.updateMany({
            where: { customerId, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
        }
        if (finalBilling && !existing.isDefaultBilling) {
          await tx.customerAddress.updateMany({
            where: { customerId, isDefaultBilling: true },
            data: { isDefaultBilling: false },
          });
        }

        const updated = await tx.customerAddress.update({
          where: { id: addressId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
            ...(phoneProvided ? { phone: phoneValue } : {}),
            ...(dto.line1 !== undefined ? { line1: dto.line1 } : {}),
            ...(dto.line2 !== undefined ? { line2: normalizeOptional(dto.line2) } : {}),
            ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode } : {}),
            ...(dto.city !== undefined ? { city: dto.city } : {}),
            ...(dto.province !== undefined ? { province: dto.province } : {}),
            type: newType,
            isDefaultShipping: finalShipping,
            isDefaultBilling: finalBilling,
          },
          select: ADDRESS_SELECT,
        });

        // Losing a default promotes the oldest compatible fallback.
        if (existing.isDefaultShipping && !finalShipping) {
          await this.promoteShippingFallback(tx, customerId, addressId);
        }
        if (existing.isDefaultBilling && !finalBilling) {
          await this.promoteBillingFallback(tx, customerId, addressId);
        }

        return updated;
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException(DEFAULT_CONFLICT);
      }
      throw err;
    }
  }

  async remove(customerId: string, addressId: string): Promise<{ success: true }> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.customerAddress.findFirst({
          where: { id: addressId, customerId },
        });
        if (!existing) throw new NotFoundException(NOT_FOUND);

        await tx.customerAddress.delete({ where: { id: addressId } });

        if (existing.isDefaultShipping) {
          await this.promoteShippingFallback(tx, customerId, addressId);
        }
        if (existing.isDefaultBilling) {
          await this.promoteBillingFallback(tx, customerId, addressId);
        }
      });
    } catch (err) {
      // A concurrent default-promotion race can hit a partial unique index → P2002.
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException(DEFAULT_CONFLICT);
      }
      throw err;
    }
    return { success: true };
  }

  async setDefaultShipping(customerId: string, addressId: string) {
    return this.setDefault(customerId, addressId, 'shipping');
  }

  async setDefaultBilling(customerId: string, addressId: string) {
    return this.setDefault(customerId, addressId, 'billing');
  }

  private async setDefault(
    customerId: string,
    addressId: string,
    kind: 'shipping' | 'billing',
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.customerAddress.findFirst({
          where: { id: addressId, customerId },
        });
        if (!existing) throw new NotFoundException(NOT_FOUND);

        if (kind === 'shipping' && !canBeDefaultShipping(existing.type)) {
          throw new BadRequestException(BILLING_NOT_SHIPPING);
        }
        if (kind === 'billing' && !canBeDefaultBilling(existing.type)) {
          throw new BadRequestException(SHIPPING_NOT_BILLING);
        }

        if (kind === 'shipping') {
          await tx.customerAddress.updateMany({
            where: { customerId, isDefaultShipping: true },
            data: { isDefaultShipping: false },
          });
          return tx.customerAddress.update({
            where: { id: addressId },
            data: { isDefaultShipping: true },
            select: ADDRESS_SELECT,
          });
        }
        await tx.customerAddress.updateMany({
          where: { customerId, isDefaultBilling: true },
          data: { isDefaultBilling: false },
        });
        return tx.customerAddress.update({
          where: { id: addressId },
          data: { isDefaultBilling: true },
          select: ADDRESS_SELECT,
        });
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BadRequestException(DEFAULT_CONFLICT);
      }
      throw err;
    }
  }

  // Promotes the oldest compatible address (excluding excludeId) as the new
  // default of the given kind. No-op when there is no compatible alternative.
  private async promoteShippingFallback(
    tx: Prisma.TransactionClient,
    customerId: string,
    excludeId: string,
  ) {
    const fallback = await tx.customerAddress.findFirst({
      where: {
        customerId,
        id: { not: excludeId },
        type: { in: [CustomerAddressType.SHIPPING, CustomerAddressType.BOTH] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (fallback) {
      await tx.customerAddress.update({
        where: { id: fallback.id },
        data: { isDefaultShipping: true },
      });
    }
  }

  private async promoteBillingFallback(
    tx: Prisma.TransactionClient,
    customerId: string,
    excludeId: string,
  ) {
    const fallback = await tx.customerAddress.findFirst({
      where: {
        customerId,
        id: { not: excludeId },
        type: { in: [CustomerAddressType.BILLING, CustomerAddressType.BOTH] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (fallback) {
      await tx.customerAddress.update({
        where: { id: fallback.id },
        data: { isDefaultBilling: true },
      });
    }
  }
}
