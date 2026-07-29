import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { CheckoutClient } from './_components/CheckoutClient';

export const metadata: Metadata = {
  title: 'Finalizar compra',
  description: 'Elige tus direcciones de envío y facturación.',
};

// Registered-only checkout. Guests still use the /cart guest flow.
export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);

  if (!user) {
    redirect('/login?next=/checkout');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-10">
        Finalizar compra
      </h1>
      <CheckoutClient />
    </div>
  );
}
