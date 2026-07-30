'use client';

import { useRouter } from 'next/navigation';

// Phase 11F-alpha fix: the primary cart CTA routes to the registered checkout.
//   authenticated  → /checkout
//   anonymous      → /login?next=/checkout
// The legacy guest email flow (CheckoutButton / POST /checkout/from-cart) is
// intentionally kept in the codebase but is no longer the primary cart CTA for
// logged-in users.
export function CheckoutCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter();

  function handleClick() {
    router.push(isAuthenticated ? '/checkout' : '/login?next=/checkout');
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors bg-stone-900 text-white hover:bg-stone-700 cursor-pointer"
      >
        Finalizar compra
      </button>
      {!isAuthenticated && (
        <p className="text-xs text-stone-400 mt-3 text-center leading-relaxed">
          Inicia sesión para completar tu compra.
        </p>
      )}
    </div>
  );
}
