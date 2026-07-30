import type { OrderShippingMethod } from '@/types/order';
import { Price } from '@/components/price';

// Phase 11F-alpha: renders the chosen shipping method (name, ETA, cost) for an
// order, or a neutral fallback for legacy/guest orders without a method.
// Purely presentational — no raw JSON, no null/undefined.
export function OrderShippingMethodBlock({
  method,
  shippingInCents,
}: {
  method: OrderShippingMethod | null;
  shippingInCents: number;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-3">
        Método de envío
      </h3>
      {method ? (
        <div className="text-sm text-stone-700 leading-relaxed">
          <p className="font-medium text-stone-900">{method.name}</p>
          <p className="text-stone-500">{method.description}</p>
          <p className="mt-1">
            {shippingInCents === 0 ? 'Gratis' : <Price cents={shippingInCents} />}
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-400">Método de envío no disponible.</p>
      )}
    </div>
  );
}
