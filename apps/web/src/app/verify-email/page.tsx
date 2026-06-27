import type { Metadata } from 'next';
import { VerifyEmailClient } from './_components/VerifyEmailClient';

export const metadata: Metadata = {
  title: 'Verificar correo',
  description: 'Confirma tu dirección de correo en MORER.',
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Verificación de correo
      </h1>
      <VerifyEmailClient token={token ?? ''} />
    </div>
  );
}
