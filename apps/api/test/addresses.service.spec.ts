import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddressesService } from '../src/customers/addresses.service';
import { CreateAddressDto } from '../src/customers/dto/create-address.dto';
import type { PrismaService } from '../src/database/prisma.service';

// ─── In-memory Prisma mock (no DB) ────────────────────────────────────────────

type AddrMock = {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createPrismaMock() {
  const customerAddress: AddrMock = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'created' }),
    update: vi.fn().mockResolvedValue({ id: 'updated' }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({ id: 'deleted' }),
  };
  const prisma = {
    customerAddress,
    $transaction: vi.fn().mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(prisma),
    ),
  };
  return prisma;
}

const CUSTOMER_ID = 'cust-1';

function addr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    customerId: CUSTOMER_ID,
    fullName: 'Ana García',
    phone: null,
    line1: 'Calle Mayor 1',
    line2: null,
    postalCode: '28001',
    city: 'Madrid',
    province: 'Madrid',
    countryCode: 'ES',
    type: 'SHIPPING',
    isDefaultShipping: false,
    isDefaultBilling: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createDto(overrides: Record<string, unknown> = {}): CreateAddressDto {
  return {
    fullName: 'Ana García',
    line1: 'Calle Mayor 1',
    postalCode: '28001',
    city: 'Madrid',
    province: 'Madrid',
    type: 'SHIPPING',
    ...overrides,
  } as CreateAddressDto;
}

describe('AddressesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AddressesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AddressesService(prisma as unknown as PrismaService);
  });

  function createData() {
    return prisma.customerAddress.create.mock.calls[0][0].data as Record<string, unknown>;
  }

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns only the authenticated customer addresses, ordered stably', async () => {
      prisma.customerAddress.findMany.mockResolvedValue([addr()]);
      await service.list(CUSTOMER_ID);

      const args = prisma.customerAddress.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ customerId: CUSTOMER_ID });
      expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
      expect(args.select).not.toHaveProperty('customerId');
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('first SHIPPING address becomes default shipping (not billing)', async () => {
      await service.create(CUSTOMER_ID, createDto({ type: 'SHIPPING' }));
      expect(createData().customerId).toBe(CUSTOMER_ID);
      expect(createData().isDefaultShipping).toBe(true);
      expect(createData().isDefaultBilling).toBe(false);
    });

    it('first BILLING address becomes default billing (not shipping)', async () => {
      await service.create(CUSTOMER_ID, createDto({ type: 'BILLING' }));
      expect(createData().isDefaultBilling).toBe(true);
      expect(createData().isDefaultShipping).toBe(false);
    });

    it('first BOTH address becomes default for both', async () => {
      await service.create(CUSTOMER_ID, createDto({ type: 'BOTH' }));
      expect(createData().isDefaultShipping).toBe(true);
      expect(createData().isDefaultBilling).toBe(true);
    });

    it('does not auto-default when one already exists', async () => {
      // existing default shipping present
      prisma.customerAddress.findFirst.mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.isDefaultShipping ? addr({ id: 'other' }) : null),
      );
      await service.create(CUSTOMER_ID, createDto({ type: 'SHIPPING' }));
      expect(createData().isDefaultShipping).toBe(false);
    });

    it('a requested default clears the previous one', async () => {
      prisma.customerAddress.findFirst.mockImplementation((args: { where: Record<string, unknown> }) =>
        Promise.resolve(args.where.isDefaultShipping ? addr({ id: 'other' }) : null),
      );
      await service.create(CUSTOMER_ID, createDto({ type: 'SHIPPING', isDefaultShipping: true }));

      expect(prisma.customerAddress.updateMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID, isDefaultShipping: true },
        data: { isDefaultShipping: false },
      });
      expect(createData().isDefaultShipping).toBe(true);
    });

    it('rejects a non-ES country and writes nothing', async () => {
      await expect(
        service.create(CUSTOMER_ID, createDto({ countryCode: 'FR' })),
      ).rejects.toThrow('Por ahora solo se admiten direcciones de España.');
      expect(prisma.customerAddress.create).not.toHaveBeenCalled();
    });

    it('rejects billing-default on a SHIPPING address', async () => {
      await expect(
        service.create(CUSTOMER_ID, createDto({ type: 'SHIPPING', isDefaultBilling: true })),
      ).rejects.toThrow('Una dirección de envío no puede ser predeterminada de facturación.');
    });

    it('rejects shipping-default on a BILLING address', async () => {
      await expect(
        service.create(CUSTOMER_ID, createDto({ type: 'BILLING', isDefaultShipping: true })),
      ).rejects.toThrow('Una dirección de facturación no puede ser predeterminada de envío.');
    });

    it('normalizes an international phone and stores null for empty', async () => {
      await service.create(CUSTOMER_ID, createDto({ phone: '+34 612 345 678' }));
      expect(createData().phone).toBe('+34612345678');

      prisma.customerAddress.create.mockClear();
      await service.create(CUSTOMER_ID, createDto({ phone: '' }));
      expect(createData().phone).toBeNull();
    });

    it('always persists countryCode ES regardless of input', async () => {
      await service.create(CUSTOMER_ID, createDto());
      expect(createData().countryCode).toBe('ES');
    });

    it('maps a P2002 unique race to a safe error', async () => {
      prisma.customerAddress.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.create(CUSTOMER_ID, createDto())).rejects.toThrow(BadRequestException);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates an owned address', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr());
      await service.update(CUSTOMER_ID, 'addr-1', { city: 'Sevilla' });

      const call = prisma.customerAddress.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'addr-1' });
      expect(call.data.city).toBe('Sevilla');
    });

    it('throws NotFound for an address that is not the caller\'s', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(null);
      await expect(service.update(CUSTOMER_ID, 'addr-x', { city: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.customerAddress.update).not.toHaveBeenCalled();
    });

    it('a type change that drops a default promotes the oldest compatible fallback', async () => {
      // existing BOTH, default shipping; change type to BILLING → shipping default cleared
      prisma.customerAddress.findFirst
        .mockResolvedValueOnce(addr({ type: 'BOTH', isDefaultShipping: true })) // the target
        .mockResolvedValueOnce(addr({ id: 'fallback', type: 'SHIPPING' })); // fallback lookup
      await service.update(CUSTOMER_ID, 'addr-1', { type: 'BILLING' });

      // The updated address loses its shipping default...
      const targetUpdate = prisma.customerAddress.update.mock.calls[0][0];
      expect(targetUpdate.data.isDefaultShipping).toBe(false);
      // ...and the fallback is promoted.
      const promote = prisma.customerAddress.update.mock.calls[1][0];
      expect(promote.where).toEqual({ id: 'fallback' });
      expect(promote.data).toEqual({ isDefaultShipping: true });
    });

    it('rejects explicitly requesting an incompatible default on the new type', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr({ type: 'SHIPPING' }));
      await expect(
        service.update(CUSTOMER_ID, 'addr-1', { type: 'SHIPPING', isDefaultBilling: true }),
      ).rejects.toThrow('Una dirección de envío no puede ser predeterminada de facturación.');
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an owned address and returns success', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr());
      const result = await service.remove(CUSTOMER_ID, 'addr-1');
      expect(prisma.customerAddress.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFound when the address is not the caller\'s', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(null);
      await expect(service.remove(CUSTOMER_ID, 'addr-x')).rejects.toThrow(NotFoundException);
      expect(prisma.customerAddress.delete).not.toHaveBeenCalled();
    });

    it('deleting a default promotes the oldest compatible fallback', async () => {
      prisma.customerAddress.findFirst
        .mockResolvedValueOnce(addr({ isDefaultShipping: true })) // target being deleted
        .mockResolvedValueOnce(addr({ id: 'fallback', type: 'SHIPPING' })); // fallback
      await service.remove(CUSTOMER_ID, 'addr-1');

      expect(prisma.customerAddress.update).toHaveBeenCalledWith({
        where: { id: 'fallback' },
        data: { isDefaultShipping: true },
      });
    });

    it('leaves no default when there is no fallback', async () => {
      prisma.customerAddress.findFirst
        .mockResolvedValueOnce(addr({ isDefaultShipping: true }))
        .mockResolvedValueOnce(null); // no fallback
      await service.remove(CUSTOMER_ID, 'addr-1');
      expect(prisma.customerAddress.update).not.toHaveBeenCalled();
    });

    it('maps a P2002 concurrency race (fallback promotion) to a safe error', async () => {
      prisma.customerAddress.findFirst
        .mockResolvedValueOnce(addr({ isDefaultShipping: true })) // target being deleted
        .mockResolvedValueOnce(addr({ id: 'fallback', type: 'SHIPPING' })); // fallback
      prisma.customerAddress.update.mockRejectedValue({ code: 'P2002' });
      await expect(service.remove(CUSTOMER_ID, 'addr-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── default endpoints ─────────────────────────────────────────────────────────

  describe('setDefaultShipping / setDefaultBilling', () => {
    it('clears the previous default before marking the selected one', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr({ type: 'SHIPPING' }));
      await service.setDefaultShipping(CUSTOMER_ID, 'addr-1');

      expect(prisma.customerAddress.updateMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID, isDefaultShipping: true },
        data: { isDefaultShipping: false },
      });
      expect(prisma.customerAddress.update).toHaveBeenCalledWith({
        where: { id: 'addr-1' },
        data: { isDefaultShipping: true },
        select: expect.anything(),
      });
    });

    it('rejects marking a BILLING address as default shipping', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr({ type: 'BILLING' }));
      await expect(service.setDefaultShipping(CUSTOMER_ID, 'addr-1')).rejects.toThrow(
        'Una dirección de facturación no puede ser predeterminada de envío.',
      );
    });

    it('rejects marking a SHIPPING address as default billing', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr({ type: 'SHIPPING' }));
      await expect(service.setDefaultBilling(CUSTOMER_ID, 'addr-1')).rejects.toThrow(
        'Una dirección de envío no puede ser predeterminada de facturación.',
      );
    });

    it('throws NotFound for an unowned address', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(null);
      await expect(service.setDefaultShipping(CUSTOMER_ID, 'addr-x')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps a P2002 concurrency race to a safe error', async () => {
      prisma.customerAddress.findFirst.mockResolvedValue(addr({ type: 'SHIPPING' }));
      prisma.customerAddress.update.mockRejectedValue({ code: 'P2002' });
      await expect(service.setDefaultShipping(CUSTOMER_ID, 'addr-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── DTO validation (postal / required) ────────────────────────────────────────

  describe('CreateAddressDto validation', () => {
    async function errorsFor(body: Record<string, unknown>) {
      const dto = plainToInstance(CreateAddressDto, {
        fullName: 'Ana',
        line1: 'Calle 1',
        postalCode: '28001',
        city: 'Madrid',
        province: 'Madrid',
        type: 'SHIPPING',
        ...body,
      });
      return (await validate(dto)).map((e) => e.property);
    }

    it('rejects a postal code that is not exactly 5 digits', async () => {
      expect(await errorsFor({ postalCode: '2801' })).toContain('postalCode');
      expect(await errorsFor({ postalCode: 'ABCDE' })).toContain('postalCode');
      expect(await errorsFor({ postalCode: '28 01' })).toContain('postalCode');
    });

    it('rejects empty required fields (after trim)', async () => {
      expect(await errorsFor({ fullName: '   ' })).toContain('fullName');
      expect(await errorsFor({ line1: '' })).toContain('line1');
      expect(await errorsFor({ city: '  ' })).toContain('city');
    });

    it('accepts a valid Spanish address', async () => {
      expect(await errorsFor({})).toHaveLength(0);
    });
  });
});
