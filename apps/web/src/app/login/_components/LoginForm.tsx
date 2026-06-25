'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormError = 'invalid_credentials' | 'too_many_requests' | 'service_error' | null;

interface LoginFormProps {
  next: string | null;
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);

  const [emailTouched, setEmailTouched] = useState(false);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());

  // Client-side validation of redirect path — only accept internal paths
  const safeNext =
    next && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/account';

  const canSubmit = !loading && EMAIL_REGEX.test(email.trim()) && password.length > 0;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          next: safeNext,
        }),
      });

      if (res.ok) {
        router.push(safeNext);
        return;
      }

      if (res.status === 401) {
        setFormError('invalid_credentials');
      } else if (res.status === 429) {
        setFormError('too_many_requests');
      } else {
        setFormError('service_error');
      }
    } catch {
      setFormError('service_error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Error banner */}
      <div aria-live="polite" aria-atomic="true">
        {formError === 'invalid_credentials' && (
          <div id="form-error" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">Email o contraseña incorrectos.</p>
          </div>
        )}
        {formError === 'too_many_requests' && (
          <div id="form-error" className="bg-amber-50 border border-amber-200 rounded-sm p-4">
            <p className="text-sm text-amber-700">Demasiados intentos. Espera un momento.</p>
          </div>
        )}
        {formError === 'service_error' && (
          <div id="form-error" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">Error de servicio. Inténtalo de nuevo.</p>
          </div>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="login-email"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          autoComplete="email"
          disabled={loading}
          aria-describedby={emailInvalid ? 'login-email-error' : undefined}
          aria-invalid={emailInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            emailInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="tu@email.com"
        />
        {emailInvalid && (
          <p id="login-email-error" className="text-xs text-red-600 mt-1">
            Introduce un email válido.
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label
          htmlFor="login-password"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Contraseña
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors border-stone-200 focus:border-stone-400 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full py-4 text-xs font-medium tracking-[0.2em] uppercase transition-colors ${
          !canSubmit
            ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
            : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
        }`}
      >
        {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </button>

      <p className="text-xs text-stone-500 text-center">
        ¿No tienes cuenta?{' '}
        <Link
          href="/register"
          className="text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
