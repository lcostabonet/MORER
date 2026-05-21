import Link from 'next/link';
import type { Product } from '@/types/product';
import { Price } from './price';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const availableSizes = product.variants.filter((v) => v.isAvailable).map((v) => v.size);

  return (
    <Link href={`/products/${product.slug}`} className="group block">
      {/* Image placeholder */}
      <div className="aspect-[3/4] bg-stone-100 rounded-sm overflow-hidden mb-5 transition-colors group-hover:bg-stone-200">
        <div className="w-full h-full flex items-end p-5">
          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-stone-400">
            {product.name.split(' ')[0]}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-medium text-stone-900 tracking-wide">{product.name}</h3>
        <Price cents={product.priceInCents} className="text-sm text-stone-500" />
        {availableSizes.length > 0 && (
          <p className="text-xs text-stone-400 tracking-wide">{availableSizes.join('  ·  ')}</p>
        )}
      </div>

      <div className="mt-4">
        <span className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-300 pb-px group-hover:border-stone-900 transition-colors">
          Comprar ahora
        </span>
      </div>
    </Link>
  );
}
