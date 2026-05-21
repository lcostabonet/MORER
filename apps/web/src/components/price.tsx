import { formatPrice } from '@/lib/utils';

interface PriceProps {
  cents: number | null;
  currency?: string;
  className?: string;
}

export function Price({ cents, currency = 'EUR', className }: PriceProps) {
  return <span className={className}>{formatPrice(cents, currency)}</span>;
}
