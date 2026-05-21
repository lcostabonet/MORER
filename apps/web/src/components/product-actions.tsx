'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductVariant } from '@/types/product';
import { getOrCreateSessionId } from '@/lib/session';
import { createOrGetCart, addCartItem } from '@/lib/cart-api';
import { SizeSelector } from './size-selector';

interface ProductActionsProps {
  variants: ProductVariant[];
}

export function ProductActions({ variants }: ProductActionsProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const hasAnyStock = variants.some((v) => v.isAvailable);

  async function handleAddToCart() {
    if (!selectedVariantId) {
      setError('Selecciona una talla para continuar.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionId = getOrCreateSessionId();
      const cart = await createOrGetCart(sessionId);
      await addCartItem(cart.id, selectedVariantId, 1);
      router.push('/cart');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al añadir al carrito. Inténtalo de nuevo.');
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SizeSelector variants={variants} onSelect={setSelectedVariantId} />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="pt-2">
        <button
          onClick={handleAddToCart}
          disabled={isLoading || !hasAnyStock}
          className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors ${
            isLoading
              ? 'bg-stone-400 text-white cursor-wait'
              : !hasAnyStock
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                : 'bg-stone-900 text-white hover:bg-stone-700'
          }`}
          aria-disabled={isLoading || !hasAnyStock}
        >
          {isLoading ? 'Añadiendo...' : !hasAnyStock ? 'Agotado' : 'Comprar ahora'}
        </button>
      </div>
    </div>
  );
}
