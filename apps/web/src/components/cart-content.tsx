'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getOrCreateSessionId } from '@/lib/session';
import { getCartBySession, updateCartItem, removeCartItem } from '@/lib/cart-api';
import { CheckoutButton } from './checkout-button';
import type { CartResponse } from '@/types/cart';
import { CartItemRow } from './cart-item-row';
import { Price } from './price';

type PageState = 'loading' | 'empty' | 'loaded' | 'error';

export function CartContent() {
  const [state, setState] = useState<PageState>('loading');
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCart = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const sessionId = getOrCreateSessionId();
      if (!sessionId) {
        setState('empty');
        return;
      }
      const data = await getCartBySession(sessionId);
      if (!data || data.items.length === 0) {
        setState('empty');
      } else {
        setCart(data);
        setState('loaded');
      }
    } catch {
      setErrorMsg('No pudimos cargar tu carrito. Inténtalo de nuevo.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function handleUpdate(itemId: string, quantity: number) {
    if (!cart) return;
    const updated = await updateCartItem(cart.id, itemId, quantity);
    setCart(updated);
    if (updated.items.length === 0) setState('empty');
  }

  async function handleRemove(itemId: string) {
    if (!cart) return;
    const updated = await removeCartItem(cart.id, itemId);
    setCart(updated);
    if (updated.items.length === 0) setState('empty');
  }

  if (state === 'loading') {
    return (
      <div className="animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-8 py-8 border-b border-stone-100">
            <div className="w-28 h-32 bg-stone-100 rounded-sm flex-shrink-0" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-4 w-1/2 bg-stone-100 rounded" />
              <div className="h-3 w-1/4 bg-stone-100 rounded" />
              <div className="h-9 w-28 bg-stone-100 rounded mt-4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="py-24 text-center">
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-4">
          Error
        </p>
        <p className="text-stone-500 mb-10">{errorMsg}</p>
        <button
          onClick={() => void loadCart()}
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  if (state === 'empty' || !cart) {
    return (
      <div className="py-24 text-center">
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-5">
          Carrito vacío
        </p>
        <p className="text-stone-500 mb-10">Todavía no has añadido ningún producto.</p>
        <Link
          href="/shop"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px hover:text-stone-600 hover:border-stone-600 transition-colors"
        >
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-14">
      {/* Items */}
      <div className="lg:col-span-2">
        {cart.items.map((item) => (
          <CartItemRow
            key={item.id}
            item={item}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
          />
        ))}
        <Link
          href="/shop"
          className="mt-8 inline-block text-xs text-stone-400 hover:text-stone-900 tracking-wide transition-colors"
        >
          ← Continuar comprando
        </Link>
      </div>

      {/* Summary */}
      <div className="lg:col-span-1">
        <div className="bg-stone-50 p-8 sticky top-24">
          <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-8">
            Resumen
          </h2>

          <div className="flex justify-between items-center pb-6 border-b border-stone-200 mb-6">
            <span className="text-sm text-stone-600">Subtotal</span>
            <Price cents={cart.subtotalInCents} className="text-sm font-medium text-stone-900" />
          </div>

          <p className="text-xs text-stone-400 mb-6 leading-relaxed">
            Gastos de envío e impuestos calculados en el siguiente paso.
          </p>

          <CheckoutButton cartId={cart.id} />
        </div>
      </div>
    </div>
  );
}
