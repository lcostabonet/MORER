import Link from 'next/link';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';

export async function Header() {
  let user = null;
  try {
    const cookieStore = await cookies();
    user = await getCurrentUser(cookieStore);
  } catch {
    // API unreachable or cookie store unavailable — render unauthenticated header
    user = null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="text-lg font-bold tracking-[0.2em] text-stone-900 hover:text-stone-600 transition-colors"
          >
            MORER
          </Link>
          <nav className="flex items-center gap-8">
            <Link
              href="/shop"
              className="text-sm text-stone-500 hover:text-stone-900 tracking-wide transition-colors"
            >
              Tienda
            </Link>
            <Link
              href="/cart"
              className="text-sm text-stone-500 hover:text-stone-900 tracking-wide transition-colors"
              aria-label="Ver carrito"
            >
              Carrito
            </Link>
            {user ? (
              <Link
                href="/account"
                className="text-sm text-stone-500 hover:text-stone-900 tracking-wide transition-colors"
                aria-label="Mi cuenta"
              >
                Mi cuenta
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm text-stone-500 hover:text-stone-900 tracking-wide transition-colors"
              >
                Iniciar sesión
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
