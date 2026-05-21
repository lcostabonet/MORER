import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-5">
        404
      </p>
      <h1 className="text-2xl font-bold text-stone-900 mb-4">Producto no encontrado</h1>
      <p className="text-stone-500 mb-10">
        Este producto no existe o ya no está disponible.
      </p>
      <Link
        href="/shop"
        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px hover:text-stone-600 hover:border-stone-600 transition-colors"
      >
        Volver a la tienda
      </Link>
    </div>
  );
}
