import type { Metadata } from 'next';
import { LoginForm } from './_components/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  description: 'Accede a tu cuenta MORER.',
};

interface PageProps {
  searchParams: Promise<{ next?: string; reset?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next, reset } = await searchParams;

  // Validate redirect server-side too — only pass safe paths to client
  const safeNext =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : null;

  const resetSuccess = reset === '1';

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Iniciar sesión
      </h1>
      <p className="text-sm text-stone-500 mb-10 leading-relaxed">
        Accede a tu cuenta para ver tus pedidos y gestionar tu perfil.
      </p>
      <LoginForm next={safeNext} resetSuccess={resetSuccess} />
    </div>
  );
}
