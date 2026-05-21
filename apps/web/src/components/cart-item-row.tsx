'use client';

import { useState } from 'react';
import type { CartItemResponse } from '@/types/cart';
import { Price } from './price';
import { QuantitySelector } from './quantity-selector';

interface CartItemRowProps {
  item: CartItemResponse;
  onUpdate: (itemId: string, quantity: number) => Promise<void>;
  onRemove: (itemId: string) => Promise<void>;
}

export function CartItemRow({ item, onUpdate, onRemove }: CartItemRowProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleIncrease() {
    setIsLoading(true);
    setError(null);
    try {
      await onUpdate(item.id, item.quantity + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDecrease() {
    if (item.quantity <= 1) return;
    setIsLoading(true);
    setError(null);
    try {
      await onUpdate(item.id, item.quantity - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemove() {
    setIsLoading(true);
    try {
      await onRemove(item.id);
    } catch {
      setError('Error al eliminar el item.');
      setIsLoading(false);
    }
  }

  return (
    <div
      className={`flex gap-5 sm:gap-8 py-8 border-b border-stone-100 transition-opacity ${
        isLoading ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {/* Image placeholder */}
      <div className="w-20 h-24 sm:w-28 sm:h-32 bg-stone-100 rounded-sm flex-shrink-0 flex items-end p-3">
        <span className="text-[9px] font-medium tracking-[0.2em] uppercase text-stone-400">
          {item.productName.split(' ')[0]}
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-stone-900 truncate">{item.productName}</h3>
            <p className="text-xs text-stone-400 tracking-wide mt-1">Talla: {item.size}</p>
          </div>
          <Price
            cents={item.lineTotalInCents}
            className="text-sm font-medium text-stone-900 flex-shrink-0"
          />
        </div>

        <div className="flex items-center justify-between">
          <QuantitySelector
            quantity={item.quantity}
            onIncrease={handleIncrease}
            onDecrease={handleDecrease}
            disabled={isLoading}
          />
          <Price cents={item.unitPriceInCents} className="text-xs text-stone-400" />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleRemove}
          disabled={isLoading}
          className="text-xs text-stone-400 hover:text-stone-900 text-left self-start transition-colors"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
