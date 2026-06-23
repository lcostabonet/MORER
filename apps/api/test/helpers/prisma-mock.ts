import { vi } from 'vitest';
import type { PrismaService } from '../../src/database/prisma.service';

// ─── Prisma mock helpers ─────────────────────────────────────────────────────
//
// These build a fully in-memory, side-effect-free stand-in for PrismaService.
// NOTHING here touches a real database, Redis, Stripe or any network service.
//
// The checkout service runs its writes inside `prisma.$transaction(cb, opts)`,
// passing a callback that receives a transactional client (`tx`). We model that
// by giving the mock a `$transaction` that simply invokes the callback with a
// `tx` object whose delegate methods are all `vi.fn()` — so a test can assert
// exactly which writes happened (or, crucially, did NOT happen).

export type TxMock = {
  cart: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inventory: {
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  customer: {
    upsert: ReturnType<typeof vi.fn>;
  };
  order: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

export type PrismaMock = {
  $transaction: ReturnType<typeof vi.fn>;
  order: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    // Used by EmailService to mark confirmationEmailSentAt after a successful send.
    updateMany: ReturnType<typeof vi.fn>;
  };
  // The transactional client handed to $transaction callbacks. Exposed so tests
  // can assert/inspect the writes attempted inside a transaction.
  __tx: TxMock;
};

export function createTxMock(): TxMock {
  return {
    cart: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventory: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    customer: {
      upsert: vi.fn(),
    },
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

export function createPrismaMock(): PrismaMock {
  const tx = createTxMock();

  const $transaction = vi.fn(
    // Mirror Prisma's interactive-transaction signature: it receives a callback
    // and an options object, and resolves to whatever the callback returns.
    async (cb: (client: TxMock) => unknown, _opts?: unknown) => cb(tx),
  );

  return {
    $transaction,
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    __tx: tx,
  };
}

// Cast helper: the service only ever touches the subset of the Prisma API we
// model above, so an `unknown` cast to PrismaService is safe for unit tests.
export function asPrismaService(mock: PrismaMock): PrismaService {
  return mock as unknown as PrismaService;
}
