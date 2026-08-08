'use client';

import { useRouter } from 'next/navigation';

// Phase 11F-alpha fix: the primary cart CTA routes to the registered checkout.
//   authenticated  → /checkout
//   anonymous      → /login?next=/checkout
// Phase 11J: the legacy guest email flow (CheckoutButton / web startCheckout) was
// removed as dead code. The guest checkout still exists at the API layer, but any
// future web guest flow must go through a BFF that stores the capability in an
// httpOnly cookie (never returning the token to client JS).
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
