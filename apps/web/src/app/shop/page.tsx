import type { Metadata } from 'next';
import { getProducts } from '@/lib/api';
import { ProductGrid } from '@/components/product-grid';
import { SectionHeading } from '@/components/section-heading';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Explora la colección completa de boardshorts MORER.',
};

export default async function ShopPage() {
  const data = await getProducts(1, 20);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="mb-16">
        <SectionHeading
          label="Colección"
          title="Shop"
          description="Boardshorts mediterráneos para todo el día de verano."
        />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title="Sin productos"
          description="No hay productos disponibles en este momento."
          href="/"
          cta="Volver al inicio"
        />
      ) : (
        <ProductGrid products={data.items} />
      )}
    </div>
  );
}
