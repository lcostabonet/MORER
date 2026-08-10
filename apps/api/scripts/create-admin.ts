/**
 * Phase 11K — secure admin provisioning CLI (no public create-admin endpoint).
 *
 * Reads credentials from the environment (transient, not CLI args), bcrypts the
 * password, and creates (or, with ADMIN_FORCE=yes, resets) an AdminUser. It NEVER
 * prints the password or the hash — only { id, email, role }. It refuses to overwrite
 * an existing admin unless forced, and requires an explicit confirmation before any
 * DB write (dry-run by default).
 *
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL="ops@morer.es"
 *   $env:ADMIN_PASSWORD="<a long password>"   # set transiently; never commit
 *   $env:ADMIN_ROLE="ADMIN"                    # ADMIN | OPERATIONS | ...
 *   pnpm --filter @morer/api admin:create      # DRY RUN (shows what it would do)
 *   $env:ADMIN_CONFIRM="create"; pnpm --filter @morer/api admin:create   # applies
 *   # To reset an existing admin's password/role add: $env:ADMIN_FORCE="yes"
 */
import { PrismaClient, AdminRole } from '@morer/database';
import * as bcrypt from 'bcryptjs';

const ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fail(msg: string): never {
  console.error(`[create-admin] ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? '').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const roleRaw = (process.env.ADMIN_ROLE ?? 'ADMIN').trim().toUpperCase();
  const confirm = process.env.ADMIN_CONFIRM;
  const force = process.env.ADMIN_FORCE === 'yes';

  if (!EMAIL_RE.test(email)) fail('ADMIN_EMAIL must be a valid email address.');
  if (password.length < 12) {
    fail('ADMIN_PASSWORD must be at least 12 characters (set it via env, never as a CLI arg).');
  }
  if (!(roleRaw in AdminRole)) {
    fail(`ADMIN_ROLE must be one of: ${Object.keys(AdminRole).join(', ')}`);
  }
  const role = AdminRole[roleRaw as keyof typeof AdminRole];
  const emailNormalized = email.toLowerCase();

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.adminUser.findUnique({
      where: { emailNormalized },
      select: { id: true, role: true },
    });

    if (existing && !force) {
      fail(
        `An admin with this email already exists (id ${existing.id}). ` +
          'Re-run with ADMIN_FORCE=yes to reset its password/role.',
      );
    }

    if (confirm !== 'create') {
      console.log(
        `[create-admin] DRY RUN — would ${existing ? 'UPDATE' : 'CREATE'} admin ${email} with role ${role}. ` +
          'Set ADMIN_CONFIRM=create to apply.',
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, ROUNDS);
    const admin = existing
      ? await prisma.adminUser.update({
          where: { emailNormalized },
          data: { passwordHash, role, disabledAt: null },
          select: { id: true, email: true, role: true },
        })
      : await prisma.adminUser.create({
          data: { email, emailNormalized, name: email.split('@')[0], role, passwordHash },
          select: { id: true, email: true, role: true },
        });

    // Only non-secret identity is printed — never the password or the hash.
    console.log(`[create-admin] ${existing ? 'UPDATED' : 'CREATED'} admin:`, admin);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
