'use client';

import Link from 'next/link';

interface OrderErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OrderError({ reset }: OrderErrorProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-4">
        Error
      </p>
      <p className="text-stone-500 mb-10">
        No pudimos cargar el pedido. Inténtalo de nuevo.
      </p>
      <div className="flex justify-center gap-8">
        <button
          onClick={reset}
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/shop"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-400 hover:text-stone-900 transition-colors"
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
