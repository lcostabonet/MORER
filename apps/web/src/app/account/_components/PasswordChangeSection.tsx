'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const GENERIC_ERROR = 'No se ha podido actualizar la contraseña. Inténtalo de nuevo.';
// Same policy as register / reset (8–72 characters).
const PASSWORD_POLICY_ERROR = 'La contraseña debe tener entre 8 y 72 caracteres.';

function passwordPolicyOk(value: string): boolean {
  return value.length >= 8 && value.length <= 72;
}

export function PasswordChangeSection() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  function resetFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setFormError(null);
  }

  function openForm() {
    resetFields();
    setOpen(true);
  }

  function closeForm() {
    resetFields();
    setOpen(false);
  }

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    if (currentPassword.length === 0) {
      errors.currentPassword = 'Introduce tu contraseña actual.';
    }
    if (newPassword.length === 0) {
      errors.newPassword = 'Introduce una contraseña nueva.';
    } else if (!passwordPolicyOk(newPassword)) {
      errors.newPassword = PASSWORD_POLICY_ERROR;
    } else if (newPassword === currentPassword) {
      errors.newPassword = 'La nueva contraseña debe ser diferente de la actual.';
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Las contraseñas nuevas no coinciden.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // block double submit
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        // Clear password material from state, then leave — the cookie is gone.
        resetFields();
        router.replace('/login?passwordChanged=1');
        return;
      }

      // Never surface a raw HTTP category to the user. For 401/403 (expired or
      // revoked session) show a safe fixed message; otherwise use the BFF's
      // controlled `error` string, falling back to the generic one.
      let message = GENERIC_ERROR;
      if (res.status === 401 || res.status === 403) {
        message = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
      } else {
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === 'string' && data.error.length > 0) {
            message = data.error;
          }
        } catch {
          // Keep generic message
        }
      }
      setFormError(message);
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (invalid: boolean) =>
    `w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
      invalid ? 'border-red-300 focus:border-red-400' : 'border-stone-200 focus:border-stone-400'
    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`;

  const labelClass =
    'block text-xs font-medium tracking-[0.1em] uppercase text-stone-500 mb-2';

  return (
    <div className="bg-stone-50 rounded-sm p-8 mb-8">
      <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-6">
        Seguridad
      </h2>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
        >
          Cambiar contraseña
        </button>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div aria-live="assertive" aria-atomic="true">
            {formError && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-sm p-4">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pwd-current" className={labelClass}>
              Contraseña actual
            </label>
            <input
              id="pwd-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? 'pwd-current-error' : undefined}
              className={inputClass(Boolean(fieldErrors.currentPassword))}
            />
            {fieldErrors.currentPassword && (
              <p id="pwd-current-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="pwd-new" className={labelClass}>
              Nueva contraseña
            </label>
            <input
              id="pwd-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={fieldErrors.newPassword ? 'pwd-new-error' : 'pwd-new-hint'}
              className={inputClass(Boolean(fieldErrors.newPassword))}
            />
            {fieldErrors.newPassword ? (
              <p id="pwd-new-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.newPassword}
              </p>
            ) : (
              <p id="pwd-new-hint" className="text-xs text-stone-400 mt-1">
                Mínimo 8 caracteres.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="pwd-confirm" className={labelClass}>
              Confirmar nueva contraseña
            </label>
            <input
              id="pwd-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? 'pwd-confirm-error' : undefined}
              className={inputClass(Boolean(fieldErrors.confirmPassword))}
            />
            {fieldErrors.confirmPassword && (
              <p id="pwd-confirm-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 text-xs font-medium tracking-[0.15em] uppercase transition-colors ${
                loading
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
              }`}
            >
              {loading ? 'Guardando...' : 'Cambiar contraseña'}
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
