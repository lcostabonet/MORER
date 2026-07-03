'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ConfirmEmailChangeClientProps {
  token: string;
}

type Status = 'verifying' | 'error';

const INVALID_MSG =
  'El enlace de cambio de correo no es válido, ha caducado o la dirección ya no está disponible.';

export function ConfirmEmailChangeClient({ token }: ConfirmEmailChangeClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  // Guard FIRST so a re-render caused by router.replace (which strips the token
  // and re-passes token='') cannot re-run the request or overwrite the result.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (!token) {
      setStatus('error');
      return;
    }
    startedRef.current = true;

    (async () => {
      let ok = false;
      try {
        const res = await fetch('/api/auth/email-change/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }

      if (ok) {
        // The BFF already cleared the auth cookie (all sessions revoked).
        // Navigate to login — this also removes the token from the URL.
        router.replace('/login?emailChanged=1');
        return;
      }

      setStatus('error');
      // Strip the token from the URL on failure.
      router.replace('/confirm-email-change');
    })();
  }, [token, router]);

  return (
    <div aria-live="polite" aria-atomic="true">
      {status === 'verifying' && (
        <p className="text-sm text-stone-500">Confirmando tu nuevo correo…</p>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-sm p-6" role="alert">
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
