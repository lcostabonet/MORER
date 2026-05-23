'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lookupOrder } from '@/lib/checkout-api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function OrderLookupPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());
  const canSubmit = orderNumber.trim() !== '' && EMAIL_REGEX.test(email.trim()) && !loading;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      const { orderId } = await lookupOrder(orderNumber.trim(), email.trim());
      router.push(`/checkout/orders/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No hemos encontrado ningún pedido con esos datos.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Consultar pedido
      </h1>
      <p className="text-sm text-stone-500 mb-10 leading-relaxed">
        Introduce el número de pedido y el email que usaste al comprar.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <label
            htmlFor="lookup-order-number"
            className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
          >
            Número de pedido
          </label>
          <input
            id="lookup-order-number"
            type="text"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="MORER-XXXXXXX-XXXX"
            disabled={loading}
            className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors border-stone-200 focus:border-stone-400 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>

        <div>
          <label
            htmlFor="lookup-email"
            className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
          >
            Email
          </label>
          <input
            id="lookup-email"
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
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors ${
            !canSubmit
              ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
              : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
          }`}
        >
          {loading ? 'Buscando...' : 'Consultar pedido'}
        </button>

        {error && (
          <p className="text-xs text-red-600 text-center leading-relaxed">{error}</p>
        )}
      </form>
    </div>
  );
}
