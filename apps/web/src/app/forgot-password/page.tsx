import type { Metadata } from 'next';
import { ForgotPasswordForm } from './_components/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  description: 'Recibe instrucciones para restablecer tu contraseña de MORER.',
};

export default function ForgotPasswordPage() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Recuperar contraseña
      </h1>
      <p className="text-sm text-stone-500 mb-10 leading-relaxed">
        Introduce tu dirección de email y te enviaremos las instrucciones para restablecer
        tu contraseña.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
