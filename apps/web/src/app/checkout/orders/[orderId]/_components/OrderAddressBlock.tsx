import type { OrderAddressSnapshot } from '@/types/order';
import { ADDRESS_UNAVAILABLE, formatOrderAddressLines } from '@/lib/order-address';

// Phase 11E-beta: renders one immutable order address snapshot as clean postal
// lines, or a neutral fallback for legacy orders without a snapshot. Purely
// presentational — no live address lookup, no raw JSON.
export function OrderAddressBlock({
  title,
  address,
}: {
  title: string;
  address: OrderAddressSnapshot | null;
}) {
  const lines = formatOrderAddressLines(address);

  return (
    <div>
      <h3 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-3">
        {title}
      </h3>
      {lines.length > 0 ? (
        <address className="not-italic text-sm text-stone-700 leading-relaxed">
          {lines.map((line, index) => (
            <span key={index} className="block">
              {line}
            </span>
          ))}
        </address>
      ) : (
        <p className="text-sm text-stone-400">{ADDRESS_UNAVAILABLE}</p>
      )}
    </div>
  );
}
