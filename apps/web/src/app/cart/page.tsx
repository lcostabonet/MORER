import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { CartContent } from '@/components/cart-content';

export const metadata: Metadata = {
  title: 'Carrito',
  description: 'Revisa los productos de tu carrito.',
};

// Resolve the session server-side so the cart CTA can route logged-in users to
// the registered checkout instead of the legacy guest flow.
export default async function CartPage() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-14">
        Tu carrito
      </h1>
      <CartContent isAuthenticated={Boolean(user)} />
    </div>
  );
}
