export function formatPrice(cents: number | null, currency = 'EUR'): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
// 5500 → "55 €"
