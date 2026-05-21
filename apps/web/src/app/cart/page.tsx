import type { Metadata } from 'next';
import { CartContent } from '@/components/cart-content';

export const metadata: Metadata = {
  title: 'Carrito',
  description: 'Revisa los productos de tu carrito.',
};

export default function CartPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-14">
        Tu carrito
      </h1>
      <CartContent />
    </div>
  );
}
