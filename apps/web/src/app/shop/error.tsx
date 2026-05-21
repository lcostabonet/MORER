'use client';

interface ShopErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ShopError({ reset }: ShopErrorProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-4">
        Error
      </p>
      <p className="text-stone-500 mb-10">
        No pudimos cargar los productos. Inténtalo de nuevo.
      </p>
      <button
        onClick={reset}
        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px hover:text-stone-600 hover:border-stone-600 transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
