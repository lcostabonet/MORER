'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startCheckout } from '@/lib/checkout-api';
import { clearSessionId } from '@/lib/session';

interface CheckoutButtonProps {
  cartId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function CheckoutButton({ cartId }: CheckoutButtonProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());
  const canSubmit = EMAIL_REGEX.test(email.trim()) && !loading;

  async function handleCheckout(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      const order = await startCheckout(cartId, email.trim());
      // Cart is now CONVERTED — clear session so next /cart visit starts fresh.
      clearSessionId();
      router.push(`/checkout/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar el checkout');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCheckout} noValidate>
      <div className="mb-4">
        <label
          htmlFor="checkout-email"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Email para consultar tu pedido
        </label>
        <input
          id="checkout-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          placeholder="tu@email.com"
          disabled={loading}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            emailInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {emailInvalid && (
          <p className="text-xs text-red-600 mt-1">Introduce un email válido.</p>
        )}
        <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
          Lo usaremos para que puedas recuperar tu pedido sin crear una cuenta.
        </p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors mb-3 ${
          !canSubmit
            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
            : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
        }`}
      >
        {loading ? 'Reservando tu pedido...' : 'Finalizar compra'}
      </button>

      {error && (
        <p className="text-xs text-red-600 text-center leading-relaxed">{error}</p>
      )}
    </form>
  );
}
