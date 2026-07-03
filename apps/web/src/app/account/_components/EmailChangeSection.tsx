'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PendingEmailChange } from '@/lib/auth';

interface EmailChangeSectionProps {
  pendingEmailChange: PendingEmailChange | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GENERIC_ERROR = 'No se ha podido procesar la solicitud. Inténtalo de nuevo.';
const REQUEST_SUCCESS = 'Hemos enviado un enlace de confirmación a tu nueva dirección.';

// Fixed locale + timeZone so the server and client render the same string
// (avoids a hydration mismatch without suppressHydrationWarning).
function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

export function EmailChangeSection({ pendingEmailChange }: EmailChangeSectionProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ newEmail?: string; currentPassword?: string }>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openForm() {
    setNewEmail('');
    setCurrentPassword('');
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
    setOpen(true);
  }

  function closeForm() {
    setOpen(false);
    setFieldErrors({});
    setFormError(null);
  }

  function validate(): boolean {
    const errors: { newEmail?: string; currentPassword?: string } = {};
    if (!EMAIL_REGEX.test(newEmail.trim())) {
      errors.newEmail = 'Introduce un correo electrónico válido.';
    }
    if (currentPassword.length === 0) {
      errors.currentPassword = 'Introduce tu contraseña actual.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // block double submit
    setFormError(null);
    setSuccessMessage(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/email-change/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEmail: newEmail.trim(),
          currentPassword,
        }),
      });

      if (res.ok) {
        let message = REQUEST_SUCCESS;
        try {
          const data = (await res.json()) as { message?: unknown };
          if (typeof data.message === 'string' && data.message.length > 0) {
            message = data.message;
          }
        } catch {
          // Keep default
        }
        setOpen(false);
        setCurrentPassword('');
        setSuccessMessage(message);
        // Re-fetch server components so the pending banner appears.
        router.refresh();
        return;
      }

      let message = GENERIC_ERROR;
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === 'string' && data.error.length > 0) {
          message = data.error;
        }
      } catch {
        // Keep generic message
      }
      // Keep what the user typed on error.
      setFormError(message);
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (cancelLoading) return;
    setCancelError(null);
    setCancelLoading(true);
    try {
      const res = await fetch('/api/auth/email-change', { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage(null);
        router.refresh();
        return;
      }
      setCancelError('No se ha podido cancelar. Inténtalo de nuevo.');
    } catch {
      setCancelError('No se ha podido cancelar. Inténtalo de nuevo.');
    } finally {
      setCancelLoading(false);
    }
  }

  const inputClass = (invalid: boolean) =>
    `w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
      invalid ? 'border-red-300 focus:border-red-400' : 'border-stone-200 focus:border-stone-400'
    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div className="mt-4">
      {/* Success banner (persists across the refresh that reveals the pending block) */}
      <div aria-live="polite" aria-atomic="true">
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-sm p-3 mb-3">
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}
      </div>

      {pendingEmailChange ? (
        <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
          <p className="text-sm text-amber-800">
            Cambio pendiente a: <strong>{pendingEmailChange.newEmail}</strong>
          </p>
          <p className="text-xs text-amber-700 mt-1">
            El enlace caduca el {formatExpiry(pendingEmailChange.expiresAt)}. Tu
            correo actual seguirá activo hasta que confirmes el nuevo.
          </p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelLoading}
            className="mt-3 text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
          >
            {cancelLoading ? 'Cancelando…' : 'Cancelar solicitud'}
          </button>
          <div aria-live="assertive" aria-atomic="true">
            {cancelError && <p className="text-xs text-red-600 mt-2">{cancelError}</p>}
          </div>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={openForm}
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
        >
          Cambiar correo electrónico
        </button>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 border border-stone-200 rounded-sm p-4">
          <div aria-live="assertive" aria-atomic="true">
            {formError && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-sm p-3">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="email-change-new" className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-500 mb-2">
              Nuevo correo electrónico
            </label>
            <input
              id="email-change-new"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.newEmail)}
              aria-describedby={fieldErrors.newEmail ? 'email-change-new-error' : undefined}
              className={inputClass(Boolean(fieldErrors.newEmail))}
            />
            {fieldErrors.newEmail && (
              <p id="email-change-new-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.newEmail}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email-change-password" className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-500 mb-2">
              Contraseña actual
            </label>
            <input
              id="email-change-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? 'email-change-password-error' : undefined}
              className={inputClass(Boolean(fieldErrors.currentPassword))}
            />
            {fieldErrors.currentPassword && (
              <p id="email-change-password-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 text-xs font-medium tracking-[0.15em] uppercase transition-colors ${
                loading ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
              }`}
            >
              {loading ? 'Enviando…' : 'Enviar enlace de confirmación'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={loading}
              className="text-xs font-medium tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
