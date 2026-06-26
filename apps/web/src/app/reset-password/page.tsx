import type { Metadata } from 'next';
import { ResetPasswordForm } from './_components/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Nueva contraseña',
  description: 'Establece una nueva contraseña para tu cuenta MORER.',
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Nueva contraseña
      </h1>
      <p className="text-sm text-stone-500 mb-10 leading-relaxed">
        Elige una contraseña segura para tu cuenta.
      </p>
      <ResetPasswordForm token={token ?? ''} />
    </div>
  );
}
