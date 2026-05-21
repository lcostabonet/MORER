'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startCheckout } from '@/lib/checkout-api';
import { clearSessionId } from '@/lib/session';

interface CheckoutButtonProps {
  cartId: string;
}

export function CheckoutButton({ cartId }: CheckoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const order = await startCheckout(cartId);
      // Cart is now CONVERTED — clear session so next /cart visit starts fresh.
      clearSessionId();
      router.push(`/checkout/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar el checkout');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => void handleCheckout()}
        disabled={loading}
        className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors mb-3 ${
          loading
            ? 'bg-stone-200 text-stone-400 cursor-wait'
            : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
        }`}
      >
        {loading ? 'Reservando tu pedido...' : 'Finalizar compra'}
      </button>
      {error && (
        <p className="text-xs text-red-600 text-center leading-relaxed">{error}</p>
      )}
    </div>
  );
}
