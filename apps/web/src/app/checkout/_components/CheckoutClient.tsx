'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getOrCreateSessionId, clearSessionId } from '@/lib/session';
import { getCartBySession } from '@/lib/cart-api';
import { Price } from '@/components/price';
import type {
  CheckoutAddress,
  CustomerCheckoutState,
  ShippingMethodCode,
} from '@/lib/checkout-types';

type Phase = 'loading' | 'empty-cart' | 'no-address' | 'ready' | 'error';

const SUBMIT_ERROR = 'No se ha podido finalizar la compra. Inténtalo de nuevo.';

function addressSummary(a: CheckoutAddress): string {
  const parts = [a.fullName, a.line1, a.line2, `${a.postalCode} ${a.city}`, a.province, 'España'];
  return parts.filter(Boolean).join(', ');
}

export function CheckoutClient() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [cartId, setCartId] = useState<string | null>(null);
  const [state, setState] = useState<CustomerCheckoutState | null>(null);
  const [selectedShippingId, setSelectedShippingId] = useState('');
  const [selectedBillingId, setSelectedBillingId] = useState('');
  const [useShippingAsBilling, setUseShippingAsBilling] = useState(false);
  const [shippingMethodCode, setShippingMethodCode] = useState<ShippingMethodCode>('STANDARD');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const sessionId = getOrCreateSessionId();
      const cart = sessionId ? await getCartBySession(sessionId) : null;
      if (!cart || cart.items.length === 0) {
        setPhase('empty-cart');
        return;
      }
      setCartId(cart.id);

      // The cartId lets the backend price shipping against the real subtotal.
      const res = await fetch(`/api/checkout?cartId=${encodeURIComponent(cart.id)}`, {
        method: 'GET',
      });
      if (res.status === 401) {
        router.replace('/login?next=/checkout');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        return;
      }
      const data = (await res.json()) as CustomerCheckoutState;
      if (
        !data ||
        !Array.isArray(data.shippingAddresses) ||
        !Array.isArray(data.billingAddresses) ||
        !Array.isArray(data.shippingMethods)
      ) {
        setPhase('error');
        return;
      }
      setState(data);

      if (data.shippingAddresses.length === 0) {
        setPhase('no-address');
        return;
      }

      // Preselect the defaults (or the first compatible address).
      const shipId = data.defaultShippingId ?? data.shippingAddresses[0].id;
      const shipAddr = data.shippingAddresses.find((a) => a.id === shipId) ?? null;
      setSelectedShippingId(shipId);
      setSelectedBillingId(data.defaultBillingId ?? data.billingAddresses[0]?.id ?? '');
      setUseShippingAsBilling(shipAddr?.type === 'BOTH' && !data.defaultBillingId);
      setShippingMethodCode(data.defaultShippingMethodCode ?? 'STANDARD');

      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedShipping =
    state?.shippingAddresses.find((a) => a.id === selectedShippingId) ?? null;
  const shippingIsBoth = selectedShipping?.type === 'BOTH';
  const billingAddresses = state?.billingAddresses ?? [];
  const shippingMethods = state?.shippingMethods ?? [];

  // Money summary — recomputed from the backend-provided subtotal and the priced
  // method the customer selected. The client never invents prices.
  const selectedMethod =
    shippingMethods.find((m) => m.code === shippingMethodCode) ?? null;
  const subtotalInCents = state?.subtotalInCents ?? 0;
  const taxInCents = state?.taxInCents ?? 0;
  const shippingInCents = selectedMethod?.priceInCents ?? 0;
  const totalInCents = subtotalInCents + shippingInCents + taxInCents;

  function changeShipping(id: string) {
    setSelectedShippingId(id);
    const a = state?.shippingAddresses.find((x) => x.id === id);
    if (a?.type !== 'BOTH') setUseShippingAsBilling(false);
  }

  const canFinalize =
    Boolean(selectedShippingId) &&
    Boolean(selectedMethod) &&
    (useShippingAsBilling && shippingIsBoth ? true : Boolean(selectedBillingId));

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cartId || submitting || !canFinalize) return;

    const sameForBilling = useShippingAsBilling && shippingIsBoth;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartId,
          shippingAddressId: selectedShippingId,
          useShippingAsBilling: sameForBilling,
          // Only the method CODE — never a price.
          shippingMethodCode,
          ...(sameForBilling ? {} : { billingAddressId: selectedBillingId }),
        }),
      });

      if (res.ok) {
        const order = (await res.json()) as { id: string };
        clearSessionId();
        router.push(`/checkout/orders/${order.id}`);
        return;
      }

      let message = SUBMIT_ERROR;
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === 'string' && data.error.length > 0) message = data.error;
      } catch {
        // keep default
      }
      setError(message);
    } catch {
      setError(SUBMIT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return <p className="text-sm text-stone-500">Cargando tu checkout…</p>;
  }

  if (phase === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-stone-500 mb-6">
          No hemos podido cargar el checkout. Inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (phase === 'empty-cart') {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-stone-500 mb-6">Tu carrito está vacío.</p>
        <Link
          href="/shop"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px"
        >
          Ir a la tienda
        </Link>
      </div>
    );
  }

  if (phase === 'no-address') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-sm p-6">
        <p className="text-sm text-amber-800 mb-4">
          No tienes ninguna dirección de envío guardada.
        </p>
        <Link
          href="/account"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Añadir dirección en Mi cuenta
        </Link>
      </div>
    );
  }

  const shippingAddresses = state?.shippingAddresses ?? [];

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Shipping address */}
      <fieldset>
        <legend className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-4">
          Dirección de envío
        </legend>
        <div className="space-y-3">
          {shippingAddresses.map((a) => (
            <label
              key={a.id}
              className="flex items-start gap-3 border border-stone-200 rounded-sm p-4 bg-white cursor-pointer"
            >
              <input
                type="radio"
                name="shipping"
                value={a.id}
                checked={selectedShippingId === a.id}
                onChange={() => changeShipping(a.id)}
                className="mt-1"
              />
              <span className="text-sm text-stone-800">
                {addressSummary(a)}
                {a.isDefaultShipping && (
                  <span className="ml-2 text-xs text-stone-500">(predeterminada)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Billing address */}
      <fieldset>
        <legend className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-4">
          Dirección de facturación
        </legend>

        {shippingIsBoth && (
          <label className="flex items-center gap-2 text-sm text-stone-700 mb-4">
            <input
              type="checkbox"
              checked={useShippingAsBilling}
              onChange={(e) => setUseShippingAsBilling(e.target.checked)}
            />
            Usar la misma dirección para facturación
          </label>
        )}

        {!(useShippingAsBilling && shippingIsBoth) && (
          billingAddresses.length > 0 ? (
            <div className="space-y-3">
              {billingAddresses.map((a) => (
                <label
                  key={a.id}
                  className="flex items-start gap-3 border border-stone-200 rounded-sm p-4 bg-white cursor-pointer"
                >
                  <input
                    type="radio"
                    name="billing"
                    value={a.id}
                    checked={selectedBillingId === a.id}
                    onChange={() => setSelectedBillingId(a.id)}
                    className="mt-1"
                  />
                  <span className="text-sm text-stone-800">
                    {addressSummary(a)}
                    {a.isDefaultBilling && (
                      <span className="ml-2 text-xs text-stone-500">(predeterminada)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
              <p className="text-sm text-amber-800 mb-2">
                No tienes ninguna dirección de facturación guardada.
              </p>
              <Link
                href="/account"
                className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
              >
                Añadir dirección en Mi cuenta
              </Link>
            </div>
          )
        )}
      </fieldset>

      {/* Shipping method (Phase 11F) */}
      <fieldset>
        <legend className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-4">
          Método de envío
        </legend>
        <div className="space-y-3">
          {shippingMethods.map((m) => (
            <label
              key={m.code}
              className="flex items-start gap-3 border border-stone-200 rounded-sm p-4 bg-white cursor-pointer"
            >
              <input
                type="radio"
                name="shipping-method"
                value={m.code}
                checked={shippingMethodCode === m.code}
                onChange={() => setShippingMethodCode(m.code)}
                className="mt-1"
              />
              <span className="flex-1 flex items-start justify-between gap-4">
                <span className="text-sm text-stone-800">
                  {m.name}
                  <span className="block text-xs text-stone-500 mt-0.5">{m.description}</span>
                </span>
                <span className="text-sm font-medium text-stone-900 whitespace-nowrap">
                  {m.priceInCents === 0 ? 'Gratis' : <Price cents={m.priceInCents} />}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Order summary */}
      <div className="bg-stone-50 rounded-sm p-6 space-y-2">
        <div className="flex justify-between text-sm text-stone-600">
          <span>Subtotal</span>
          <Price cents={subtotalInCents} />
        </div>
        <div className="flex justify-between text-sm text-stone-600">
          <span>Envío</span>
          <span>{shippingInCents === 0 ? 'Gratis' : <Price cents={shippingInCents} />}</span>
        </div>
        <div className="flex justify-between text-sm text-stone-600">
          <span>Impuestos</span>
          <Price cents={taxInCents} />
        </div>
        <div className="flex justify-between text-sm font-medium text-stone-900 pt-2 border-t border-stone-200">
          <span>Total</span>
          <Price cents={totalInCents} />
        </div>
      </div>

      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!canFinalize || submitting}
        className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors ${
          !canFinalize || submitting
            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
            : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
        }`}
      >
        {submitting ? 'Procesando…' : 'Finalizar compra'}
      </button>

      <p className="text-xs text-stone-400 text-center leading-relaxed">
        El pago se realiza en el siguiente paso.
      </p>
    </form>
  );
}
