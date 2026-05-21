'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cancelCheckoutOrder } from '@/lib/checkout-api';

interface CancelOrderButtonProps {
  orderId: string;
}

export function CancelOrderButton({ orderId }: CancelOrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setLoading(true);
    setError(null);
    try {
      await cancelCheckoutOrder(orderId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cancelar el pedido');
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => void handleCancel()}
        disabled={loading}
        className={`text-xs font-medium tracking-[0.15em] uppercase transition-colors border-b pb-px ${
          loading
            ? 'text-stone-300 border-stone-200 cursor-wait'
            : 'text-stone-500 border-stone-300 hover:text-stone-900 hover:border-stone-900 cursor-pointer'
        }`}
      >
        {loading ? 'Cancelando...' : 'Cancelar pedido'}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 leading-relaxed">{error}</p>
      )}
    </div>
  );
}
