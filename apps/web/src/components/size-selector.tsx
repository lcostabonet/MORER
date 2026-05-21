'use client';

import { useState } from 'react';
import type { ProductVariant } from '@/types/product';

interface SizeSelectorProps {
  variants: ProductVariant[];
}

export function SizeSelector({ variants }: SizeSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-3">
        Talla{selected ? ` — ${selected}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const isSelected = selected === variant.size;
          const available = variant.isAvailable;

          return (
            <button
              key={variant.id}
              onClick={() => available && setSelected(variant.size)}
              disabled={!available}
              aria-pressed={isSelected}
              aria-disabled={!available}
              className={[
                'w-12 h-12 text-sm font-medium border transition-all',
                isSelected
                  ? 'bg-stone-900 text-white border-stone-900'
                  : available
                    ? 'bg-white text-stone-900 border-stone-300 hover:border-stone-900'
                    : 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed line-through',
              ].join(' ')}
            >
              {variant.size}
            </button>
          );
        })}
      </div>
      {!variants.some((v) => v.isAvailable) && (
        <p className="mt-3 text-xs text-stone-400">Todas las tallas agotadas.</p>
      )}
    </div>
  );
}
