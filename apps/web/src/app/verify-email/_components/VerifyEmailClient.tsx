'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface VerifyEmailClientProps {
  token: string;
}

type Status = 'verifying' | 'success' | 'error';

const SUCCESS_MSG = 'Correo verificado correctamente.';
const INVALID_MSG = 'El enlace de verificación no es válido o ha caducado.';

export function VerifyEmailClient({ token }: VerifyEmailClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  // Guard against React 18 StrictMode double-invocation and re-renders so the
  // token is POSTed at most once.
  const startedRef = useRef(false);

  useEffect(() => {
    // Guard FIRST. Once the request has started we must ignore every later run of
    // this effect — in particular the re-render caused by router.replace below,
    // which strips the token and re-passes token='' as a prop. Without this
    // ordering that re-run would hit the `!token` branch and flip a finished
    // 'success'/'error' result to the invalid-link state.
    if (startedRef.current) return;
    if (!token) {
      setStatus('error');
      return;
    }
    startedRef.current = true;

    (async () => {
      let ok = false;
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }

      setStatus(ok ? 'success' : 'error');

      // Strip the token from the URL regardless of outcome so it is not kept in
      // history, referer headers, or on a page refresh.
      router.replace('/verify-email');
    })();
  }, [token, router]);

  return (
    <div aria-live="polite" aria-atomic="true">
      {status === 'verifying' && (
        <p className="text-sm text-stone-500">Verificando tu correo…</p>
      )}

      {status === 'success' && (
        <div className="bg-green-50 border border-green-200 rounded-sm p-6">
          <p className="text-sm text-green-700 mb-4">{SUCCESS_MSG}</p>
          <Link
            href="/account"
            className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
          >
            Ir a mi cuenta
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div
          className="bg-red-50 border border-red-200 rounded-sm p-6"
          role="alert"
        >
          <p className="text-sm text-red-700 mb-4">{INVALID_MSG}</p>
          <Link
            href="/account"
            className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
          >
            Ir a mi cuenta
          </Link>
        </div>
      )}
    </div>
  );
}
