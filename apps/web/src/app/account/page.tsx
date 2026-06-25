import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { LogoutButton } from './_components/LogoutButton';

export const metadata: Metadata = {
  title: 'Mi cuenta',
  description: 'Gestiona tu cuenta y pedidos en MORER.',
};

export default async function AccountPage() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);

  if (!user) {
    redirect('/login?next=/account');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-1">
            Mi cuenta
          </h1>
          <p className="text-sm text-stone-500">
            Hola, {user.firstName}.
          </p>
        </div>
        <LogoutButton />
      </div>

      {/* Profile info */}
      <div className="bg-stone-50 rounded-sm p-8 mb-8">
        <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-6">
          Perfil
        </h2>
        <dl className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:gap-8">
            <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
              Nombre
            </dt>
            <dd className="text-sm text-stone-900">
              {user.firstName} {user.lastName}
            </dd>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-8">
            <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
              Email
            </dt>
            <dd className="text-sm text-stone-900">{user.email}</dd>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-8">
            <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
              ID
            </dt>
            <dd className="text-xs text-stone-400 font-mono">{user.id.slice(0, 8)}…</dd>
          </div>
        </dl>
      </div>

      {/* Quick links */}
      <div className="space-y-3">
        <Link
          href="/orders/lookup"
          className="block text-xs font-medium tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors"
        >
          Consultar pedido →
        </Link>
        <Link
          href="/shop"
          className="block text-xs font-medium tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors"
        >
          Ir a la tienda →
        </Link>
      </div>
    </div>
  );
}
