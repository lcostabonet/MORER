import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getProductBySlug, getProducts } from '@/lib/api';
import { Price } from '@/components/price';
import { SizeSelector } from '@/components/size-selector';

// Pre-generate known product pages at build time.
// If the API is unavailable during build, returns [] — pages are then
// server-rendered on demand and cached by ISR after first request.
export async function generateStaticParams() {
  try {
    const data = await getProducts(1, 50);
    return data.items.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Producto no encontrado' };
  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const hasAvailableSizes = product.variants.some((v) => v.isAvailable);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Back link */}
      <Link
        href="/shop"
        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-400 hover:text-stone-900 transition-colors mb-14 inline-block"
      >
        ← Tienda
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20">
        {/* Image placeholder */}
        <div className="aspect-[3/4] bg-stone-100 rounded-sm flex items-end p-8">
          <span className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400">
            {product.name}
          </span>
        </div>

        {/* Product info */}
        <div className="flex flex-col gap-8 lg:py-4">
          {/* Name + price */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
              {product.name}
            </h1>
            <Price cents={product.priceInCents} className="text-xl text-stone-500" />
          </div>

          {/* Description */}
          {product.description && (
            <p className="text-stone-500 leading-relaxed text-sm">{product.description}</p>
          )}

          {/* Size selector */}
          <SizeSelector variants={product.variants} />

          {/* CTA */}
          <div className="pt-2">
            <button
              disabled
              className="w-full bg-stone-900 text-white py-4 text-xs font-medium tracking-[0.2em] uppercase opacity-50 cursor-not-allowed"
              aria-disabled="true"
            >
              {hasAvailableSizes ? 'Comprar ahora' : 'Agotado'}
            </button>
            {hasAvailableSizes && (
              <p className="mt-3 text-xs text-stone-400 text-center">
                El carrito estará disponible próximamente.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
