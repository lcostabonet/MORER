'use client';

import { useState } from 'react';

interface EmailVerificationStatusProps {
  verified: boolean;
}

const RESEND_FALLBACK_MSG =
  'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.';
const RESEND_ERROR_MSG =
  'No se ha podido enviar el correo. Inténtalo de nuevo más tarde.';

export function EmailVerificationStatus({
  verified,
}: EmailVerificationStatusProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (verified) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-sm px-4 py-3">
        <span aria-hidden="true" className="text-green-600">
          ✓
        </span>
        <p className="text-sm text-green-700">Correo verificado</p>
      </div>
    );
  }

  async function handleResend() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
      });
      if (res.ok) {
        let msg = RESEND_FALLBACK_MSG;
        try {
          const data = (await res.json()) as { message?: unknown };
          if (typeof data.message === 'string' && data.message.length > 0) {
            msg = data.message;
          }
        } catch {
          // Keep fallback
        }
        setMessage(msg);
      } else {
        setError(RESEND_ERROR_MSG);
      }
    } catch {
      setError(RESEND_ERROR_MSG);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
      <p className="text-sm text-amber-800 mb-3">
        Tu correo está pendiente de verificación
      </p>
      <button
        type="button"
        onClick={handleResend}
        disabled={loading}
        className={`text-xs font-medium tracking-[0.15em] uppercase underline underline-offset-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
          loading
            ? 'text-stone-400 cursor-not-allowed'
            : 'text-stone-900 hover:text-stone-600 cursor-pointer'
        }`}
      >
        {loading ? 'Enviando…' : 'Reenviar correo de verificación'}
      </button>
      <div aria-live="polite" aria-atomic="true" className="mt-2">
        {message && <p className="text-xs text-green-700">{message}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
