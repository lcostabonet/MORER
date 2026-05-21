import Link from 'next/link';
import type { Metadata } from 'next';
import { getProducts } from '@/lib/api';
import { ProductGrid } from '@/components/product-grid';
import { SectionHeading } from '@/components/section-heading';

export const metadata: Metadata = {
  title: 'MORER — Boardshorts mediterráneos',
  description: 'Boardshorts mediterráneos para todo el día de verano.',
};

const BENEFITS = [
  {
    title: 'Secado rápido',
    description: 'Del agua a la arena sin esperas. Tejido técnico de alto rendimiento.',
  },
  {
    title: 'Corte cómodo',
    description: 'Diseñado para moverte libremente, dentro y fuera del agua.',
  },
  {
    title: 'Para todo el día',
    description: 'Del mar a la terraza. Del paddel al chiringuito.',
  },
];

export default async function HomePage() {
  let featuredProducts: Awaited<ReturnType<typeof getProducts>>['items'] = [];

  try {
    const data = await getProducts(1, 4);
    featuredProducts = data.items.slice(0, 4);
  } catch {
    // Home se muestra sin productos si la API no está disponible
  }

  return (
    <>
      {/* Hero */}
      <section className="min-h-[90vh] flex flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto w-full">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.25em] uppercase text-stone-400 mb-8">
              Mediterranean style
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 tracking-tight leading-[1.1]">
              Boardshorts mediterráneos para todo el día de verano.
            </h1>
            <p className="mt-8 text-lg text-stone-500 max-w-lg leading-relaxed">
              Diseñados para el Mediterráneo. Cómodos, rápidos y hechos para moverse.
            </p>
            <div className="mt-10">
              <Link
                href="/shop"
                className="inline-block bg-stone-900 text-white px-10 py-4 text-xs font-medium tracking-[0.2em] uppercase hover:bg-stone-700 transition-colors"
              >
                Ver colección
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 lg:gap-20">
            {BENEFITS.map((benefit) => (
              <div key={benefit.title}>
                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-stone-900 mb-3">
                  {benefit.title}
                </h3>
                <p className="text-sm text-stone-500 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured products */}
      {featuredProducts.length > 0 && (
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-16">
              <SectionHeading label="Colección" title="Productos" />
              <Link
                href="/shop"
                className="hidden sm:block text-xs font-medium tracking-[0.15em] uppercase text-stone-500 border-b border-stone-300 pb-px hover:text-stone-900 hover:border-stone-900 transition-colors"
              >
                Ver todos
              </Link>
            </div>
            <ProductGrid products={featuredProducts} />
          </div>
        </section>
      )}

      {/* MORER Club */}
      <section className="py-24 bg-stone-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-medium tracking-[0.25em] uppercase text-stone-500 mb-5">
            MORER Club
          </p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-5">
            Acceso anticipado a los drops.
          </h2>
          <p className="text-stone-400 max-w-md mx-auto text-sm leading-relaxed">
            Sé el primero en acceder a las nuevas colecciones y ediciones limitadas del Mediterráneo.
          </p>
          <div className="mt-10 inline-block border border-stone-700 px-10 py-4 text-xs text-stone-500 tracking-[0.2em] uppercase">
            Próximamente
          </div>
        </div>
      </section>
    </>
  );
}
