import type { Metadata } from 'next';
import { RegisterForm } from './_components/RegisterForm';

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Crea tu cuenta en MORER para gestionar tus pedidos.',
};

export default function RegisterPage() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Crear cuenta
      </h1>
      <p className="text-sm text-stone-500 mb-10 leading-relaxed">
        Regístrate para gestionar tus pedidos y acceder a tu historial de compras.
      </p>
      <RegisterForm />
    </div>
  );
}
