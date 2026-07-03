import type { Metadata } from 'next';
import { ConfirmEmailChangeClient } from './_components/ConfirmEmailChangeClient';

export const metadata: Metadata = {
  title: 'Confirmar nuevo correo',
  description: 'Confirma el cambio de correo de tu cuenta MORER.',
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ConfirmEmailChangePage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Confirmar nuevo correo
      </h1>
      <ConfirmEmailChangeClient token={token ?? ''} />
    </div>
  );
}
