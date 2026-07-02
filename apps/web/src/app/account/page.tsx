import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { LogoutButton } from './_components/LogoutButton';
import { ProfileCard } from './_components/ProfileCard';
import { LogoutAllButton } from '@/components/logout-all-button';

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

      {/* Profile info — read/edit handled client-side */}
      <ProfileCard
        firstName={user.firstName}
        lastName={user.lastName}
        email={user.email}
        phone={user.phone}
        emailVerified={user.emailVerified}
      />

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

      <div className="mt-8">
        <LogoutAllButton />
      </div>
    </div>
  );
}
