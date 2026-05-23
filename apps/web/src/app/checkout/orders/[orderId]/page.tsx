import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/config';
import type { OrderResponse } from '@/types/order';
import { Price } from '@/components/price';
import { CancelOrderButton } from '@/components/cancel-order-button';
import { PaymentForm } from '@/components/payment-form';
import { AutoRefresh } from '@/components/auto-refresh';

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
  searchParams: Promise<{ redirect_status?: string; payment_intent?: string }>;
}

export const metadata: Metadata = {
  title: 'Pedido',
  description: 'Resumen de tu pedido.',
};

export default async function OrderPage({ params, searchParams }: PageProps) {
  const { orderId } = await params;
  const { redirect_status, payment_intent: paymentIntentId } = await searchParams;
  const order = await fetchOrder(orderId);

  const isPending = order.status === 'PENDING_PAYMENT';
  const isPaid = order.status === 'PAID';
  const isCancelled = order.status === 'CANCELLED';
  // Stripe redirects back with ?redirect_status=succeeded after 3D Secure authentication.
  const returnedFromStripe = redirect_status === 'succeeded';

  function pageTitle(): string {
    if (isPaid) return 'Pago confirmado';
    if (isCancelled) return 'Pedido cancelado';
    if (isPending && returnedFromStripe) return 'Verificando pago...';
    if (isPending) return 'Completa tu pago';
    return 'Tu pedido';
  }

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
        {/* ── Left column ───────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-2">
            {pageTitle()}
          </h1>
          <p className="text-xs font-medium tracking-[0.15em] uppercase text-stone-400 mb-10">
            {order.orderNumber}
          </p>

          {/* PAID — success banner */}
          {isPaid && (
            <div className="bg-green-50 border border-green-200 rounded-sm p-5 mb-10">
              <p className="text-sm font-medium text-green-800 mb-1">
                Tu pedido ha sido confirmado
              </p>
              <p className="text-sm text-green-700 leading-relaxed">
                Recibirás más información sobre tu pedido próximamente.
              </p>
            </div>
          )}

          {/* CANCELLED — stock released banner */}
          {isCancelled && (
            <div className="bg-stone-50 border border-stone-100 rounded-sm p-5 mb-10">
              <p className="text-sm text-stone-500 leading-relaxed">
                La reserva de stock se ha liberado.
              </p>
            </div>
          )}

          {/* PENDING — returning from 3D Secure, waiting for webhook */}
          {isPending && returnedFromStripe && (
            <div className="bg-amber-50 border border-amber-100 rounded-sm p-5 mb-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-4 w-4 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin flex-shrink-0" />
                <p className="text-sm font-medium text-amber-800">Verificando el pago con el banco</p>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Esto puede tardar unos segundos. La página se actualizará automáticamente.
              </p>
              <AutoRefresh delayMs={3000} orderId={orderId} paymentIntentId={paymentIntentId} />
            </div>
          )}

          {/* Order items */}
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

          {/* PENDING — payment form (only when not returning from 3D Secure) */}
          {isPending && !returnedFromStripe && (
            <div className="pt-10 mt-2 border-t border-stone-100">
              <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-6">
                Método de pago
              </h2>
              <PaymentForm orderId={order.id} totalInCents={order.totalInCents} />
            </div>
          )}
        </div>

        {/* ── Right column — summary panel ──────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-stone-50 p-8 sticky top-24">
            <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-8">
              Resumen
            </h2>

            {/* Status badge */}
            <div className="mb-6">
              <span
                className={`inline-block text-xs font-medium tracking-[0.15em] uppercase px-3 py-1.5 rounded-sm ${
                  isPaid
                    ? 'bg-green-50 text-green-700'
                    : isPending
                      ? 'bg-amber-50 text-amber-700'
                      : isCancelled
                        ? 'bg-stone-100 text-stone-500'
                        : 'bg-stone-100 text-stone-600'
                }`}
              >
                {isPaid
                  ? 'Pagado'
                  : isPending
                    ? 'Pendiente de pago'
                    : isCancelled
                      ? 'Cancelado'
                      : order.status}
              </span>
            </div>

            {/* Total — always from backend, never calculated in frontend */}
            <div className="flex justify-between items-center pb-6 border-b border-stone-200 mb-6">
              <span className="text-sm text-stone-600">Total</span>
              <Price cents={order.totalInCents} className="text-sm font-medium text-stone-900" />
            </div>

            <p className="text-xs text-stone-400 mb-8 leading-relaxed">
              {isPaid
                ? 'Pago procesado correctamente.'
                : 'Envío e impuestos calculados en el siguiente paso.'}
            </p>

            {/* Actions */}
            <div className="space-y-4">
              {isPending && !returnedFromStripe && (
                <CancelOrderButton orderId={order.id} />
              )}
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
