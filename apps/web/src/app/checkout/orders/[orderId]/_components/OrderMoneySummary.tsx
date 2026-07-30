import { Price } from '@/components/price';

// Phase 11F-alpha: order money breakdown (Subtotal / Envío / Impuestos / Total).
// All values come from the backend; never calculated in the frontend. Free
// shipping shows "Gratis".
export function OrderMoneySummary({
  subtotalInCents,
  shippingInCents,
  taxInCents,
  totalInCents,
}: {
  subtotalInCents: number;
  shippingInCents: number;
  taxInCents: number;
  totalInCents: number;
}) {
  return (
    <div className="space-y-2 pb-6 border-b border-stone-200 mb-6">
      <div className="flex justify-between text-sm text-stone-600">
        <span>Subtotal</span>
        <Price cents={subtotalInCents} />
      </div>
      <div className="flex justify-between text-sm text-stone-600">
        <span>Envío</span>
        <span>{shippingInCents === 0 ? 'Gratis' : <Price cents={shippingInCents} />}</span>
      </div>
      <div className="flex justify-between text-sm text-stone-600">
        <span>Impuestos</span>
        <Price cents={taxInCents} />
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-stone-200">
        <span className="text-sm text-stone-600">Total</span>
        <Price cents={totalInCents} className="text-sm font-medium text-stone-900" />
      </div>
    </div>
  );
}
