import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import type { OrderResponse } from '@/types/order';
import { Price } from '@/components/price';
import { CancelOrderButton } from '@/components/cancel-order-button';

async function fetchOrder(orderId: string): Promise<OrderResponse> {
  const res = await fetch(`${API_URL}/checkout/orders/${orderId}`, {
    cache: 'no-store',
  });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Error al cargar el pedido');
  return res.json() as Promise<OrderResponse>;
}

interface PageProps {
  params: Promise<{ orderId: string }>;
}

export const metadata: Metadata = {
  title: 'Pedido',
  description: 'Resumen de tu pedido.',
};

export default async function OrderPage({ params }: PageProps) {
  const { orderId } = await params;
  const order = await fetchOrder(orderId);

  const isPending = order.status === 'PENDING_PAYMENT';
  const isCancelled = order.status === 'CANCELLED';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Back */}
      <Link
        href="/shop"
        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-400 hover:text-stone-900 transition-colors mb-14 inline-block"
      >
        ← Volver a la tienda
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-14">
        {/* Items */}
        <div className="lg:col-span-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-2">
            {isPending ? 'Pedido reservado' : isCancelled ? 'Pedido cancelado' : 'Tu pedido'}
          </h1>
          <p className="text-xs font-medium tracking-[0.15em] uppercase text-stone-400 mb-10">
            {order.orderNumber}
          </p>

          {/* Status banner */}
          {isPending && (
            <div className="bg-stone-50 border border-stone-100 rounded-sm p-5 mb-10">
              <p className="text-sm text-stone-600 leading-relaxed">
                Tu stock se ha reservado temporalmente. El pago online estará disponible en la
                siguiente fase.
              </p>
            </div>
          )}
          {isCancelled && (
            <div className="bg-stone-50 border border-stone-100 rounded-sm p-5 mb-10">
              <p className="text-sm text-stone-500 leading-relaxed">
                La reserva de stock se ha liberado.
              </p>
            </div>
          )}

          {/* Item list */}
          <div className="divide-y divide-stone-100">
            {order.items.map((item) => (
              <div key={item.id} className="py-6 flex justify-between items-start gap-6">
                <div>
                  <p className="text-sm font-medium text-stone-900">{item.productName}</p>
                  <p className="text-xs text-stone-400 mt-1 tracking-wide">
                    Talla {item.variantSize}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Cantidad: {item.quantity}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <Price
                    cents={item.lineTotalInCents}
                    className="text-sm font-medium text-stone-900"
                  />
                  {item.quantity > 1 && (
                    <p className="text-xs text-stone-400 mt-0.5">
                      <Price cents={item.unitPriceInCents} /> / ud.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary panel */}
        <div className="lg:col-span-1">
          <div className="bg-stone-50 p-8 sticky top-24">
            <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-8">
              Resumen
            </h2>

            {/* Status badge */}
            <div className="mb-6">
              <span
                className={`inline-block text-xs font-medium tracking-[0.15em] uppercase px-3 py-1.5 rounded-sm ${
                  isPending
                    ? 'bg-amber-50 text-amber-700'
                    : isCancelled
                      ? 'bg-stone-100 text-stone-500'
                      : 'bg-stone-100 text-stone-600'
                }`}
              >
                {isPending ? 'Pendiente de pago' : isCancelled ? 'Cancelado' : order.status}
              </span>
            </div>

            {/* Total */}
            <div className="flex justify-between items-center pb-6 border-b border-stone-200 mb-6">
              <span className="text-sm text-stone-600">Total</span>
              <Price cents={order.totalInCents} className="text-sm font-medium text-stone-900" />
            </div>

            <p className="text-xs text-stone-400 mb-8 leading-relaxed">
              Envío e impuestos calculados en el siguiente paso.
            </p>

            {/* Actions */}
            <div className="space-y-4">
              {isPending && <CancelOrderButton orderId={order.id} />}
              <Link
                href="/shop"
                className="block text-center text-xs font-medium tracking-[0.15em] uppercase text-stone-400 hover:text-stone-900 transition-colors"
              >
                Seguir comprando
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
