import Link from 'next/link';

interface EmptyStateProps {
  title?: string;
  description?: string;
  href?: string;
  cta?: string;
}

export function EmptyState({
  title = 'Sin productos',
  description = 'No hay productos disponibles en este momento.',
  href = '/',
  cta = 'Volver al inicio',
}: EmptyStateProps) {
  return (
    <div className="py-32 text-center">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-stone-300 mb-4">
        {title}
      </p>
      <p className="text-stone-500">{description}</p>
      <Link
        href={href}
        className="mt-8 inline-block text-xs font-medium tracking-[0.15em] uppercase text-stone-900 border-b border-stone-900 pb-px"
      >
        {cta}
      </Link>
    </div>
  );
}
