'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Visual-only toggle: reveal both fields at once so the user can compare them.
  // Always starts hidden and is never persisted anywhere.
  const [showPasswords, setShowPasswords] = useState(false);

  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const passwordInvalid = passwordTouched && (password.length < 8 || password.length > 72);
  const confirmInvalid = confirmTouched && passwordConfirmation !== password;

  const canSubmit =
    !loading &&
    password.length >= 8 &&
    password.length <= 72 &&
    passwordConfirmation === password;

  // No token — show invalid link state
  if (!token) {
    return (
      <div
        className="bg-red-50 border border-red-200 rounded-sm p-6"
        role="alert"
        aria-live="polite"
      >
        <p className="text-sm text-red-700 mb-4">
          Enlace de recuperación no válido. Solicita uno nuevo.
        </p>
        <Link
          href="/forgot-password"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Recuperar contraseña
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, passwordConfirmation }),
      });

      if (res.ok) {
        router.replace('/login?reset=1');
        router.refresh();
        return;
      }

      let errorMessage = 'Error de servicio. Inténtalo de nuevo.';
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === 'string' && data.error) {
          errorMessage = data.error;
        }
      } catch {
        // Use default message
      }
      setFormError(errorMessage);
    } catch {
      setFormError('Error de servicio. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Error banner */}
      <div aria-live="polite" aria-atomic="true">
        {formError !== null && (
          <div id="form-error" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">{formError}</p>
          </div>
        )}
      </div>

      {/* New password */}
      <div>
        <label
          htmlFor="reset-password"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Nueva contraseña
        </label>
        <input
          id="reset-password"
          type={showPasswords ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          autoComplete="new-password"
          disabled={loading}
          aria-describedby={passwordInvalid ? 'reset-password-error' : 'reset-password-hint'}
          aria-invalid={passwordInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            passwordInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {passwordInvalid ? (
          <p id="reset-password-error" className="text-xs text-red-600 mt-1">
            La contraseña debe tener entre 8 y 72 caracteres.
          </p>
        ) : (
          <p id="reset-password-hint" className="text-xs text-stone-400 mt-1">
            Mínimo 8 caracteres.
          </p>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <label
          htmlFor="reset-confirm-password"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Confirmar contraseña
        </label>
        <input
          id="reset-confirm-password"
          type={showPasswords ? 'text' : 'password'}
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          autoComplete="new-password"
          disabled={loading}
          aria-describedby={confirmInvalid ? 'reset-confirm-error' : undefined}
          aria-invalid={confirmInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            confirmInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {confirmInvalid && (
          <p id="reset-confirm-error" className="text-xs text-red-600 mt-1">
            Las contraseñas no coinciden.
          </p>
        )}
      </div>

      {/* Reveal both fields at once so the user can verify they match */}
      <div>
        <button
          type="button"
          aria-pressed={showPasswords}
          aria-label={
            showPasswords ? 'Ocultar las contraseñas' : 'Mostrar las contraseñas'
          }
          onClick={() => setShowPasswords((v) => !v)}
          className={`text-xs font-medium tracking-[0.1em] uppercase underline underline-offset-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 ${
            showPasswords
              ? 'text-stone-900 hover:text-stone-600'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          {showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
        </button>
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
        {loading ? 'Cambiando...' : 'Cambiar contraseña'}
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
