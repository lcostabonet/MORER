'use client';

import { useState } from 'react';
import Link from 'next/link';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [emailTouched, setEmailTouched] = useState(false);

  const emailInvalid = emailTouched && !EMAIL_REGEX.test(email.trim());
  const canSubmit = !loading && EMAIL_REGEX.test(email.trim());

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      // Intentionally swallowed — always show the generic success message
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div
        className="bg-stone-50 border border-stone-200 rounded-sm p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-stone-700 leading-relaxed">
          Si existe una cuenta asociada a ese correo, recibirás instrucciones para
          restablecer la contraseña.
        </p>
        <p className="mt-4">
          <Link
            href="/login"
            className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
          >
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Inline email error lives inside aria-live so screen readers catch it */}
      <div aria-live="polite" aria-atomic="true">
        {emailInvalid && (
          <p id="forgot-email-error" className="text-xs text-red-600">
            Introduce un email válido.
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="forgot-email"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          autoComplete="email"
          disabled={loading}
          aria-describedby={emailInvalid ? 'forgot-email-error' : undefined}
          aria-invalid={emailInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            emailInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="tu@email.com"
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
        {loading ? 'Enviando...' : 'Enviar instrucciones'}
      </button>

      <p className="text-xs text-stone-500 text-center">
        <Link
          href="/login"
          className="text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
