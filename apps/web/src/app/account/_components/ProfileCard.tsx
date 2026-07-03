'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PendingEmailChange } from '@/lib/auth';
import { EmailVerificationStatus } from './EmailVerificationStatus';
import { EmailChangeSection } from './EmailChangeSection';

interface ProfileCardProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  pendingEmailChange: PendingEmailChange | null;
}

const GENERIC_ERROR = 'No se ha podido actualizar el perfil. Inténtalo de nuevo.';
const PHONE_ERROR =
  'Introduce un teléfono internacional válido, por ejemplo +34 612 345 678.';
const NAME_ERROR = 'El nombre es obligatorio.';
const LASTNAME_ERROR = 'Los apellidos son obligatorios.';
const SUCCESS = 'Perfil actualizado correctamente.';

// Client-side mirror of the server's normalizePhone acceptance rule: optional,
// but if present must be '+' followed by 8–15 digits once separators are removed.
function phoneLooksValid(raw: string): boolean {
  const t = raw.trim();
  if (t === '') return true;
  if (!t.startsWith('+')) return false;
  const digits = t.slice(1).replace(/[\s\-()]/g, '');
  return /^\d{8,15}$/.test(digits);
}

export function ProfileCard({
  firstName,
  lastName,
  email,
  phone,
  emailVerified,
  pendingEmailChange,
}: ProfileCardProps) {
  const router = useRouter();

  // Persisted (server-truth) values shown in read mode and restored on cancel.
  const [saved, setSaved] = useState({ firstName, lastName, phone });

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Controlled inputs.
  const [firstNameValue, setFirstNameValue] = useState(firstName);
  const [lastNameValue, setLastNameValue] = useState(lastName);
  const [phoneValue, setPhoneValue] = useState(phone ?? '');
  const [fieldErrors, setFieldErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>({});

  function startEditing() {
    setFirstNameValue(saved.firstName);
    setLastNameValue(saved.lastName);
    setPhoneValue(saved.phone ?? '');
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setEditing(true);
  }

  function cancelEditing() {
    // Restore persisted values, drop everything typed, send no request.
    setFirstNameValue(saved.firstName);
    setLastNameValue(saved.lastName);
    setPhoneValue(saved.phone ?? '');
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setEditing(false);
  }

  function validate(): boolean {
    const errors: { firstName?: string; lastName?: string; phone?: string } = {};
    if (firstNameValue.trim() === '') errors.firstName = NAME_ERROR;
    if (lastNameValue.trim() === '') errors.lastName = LASTNAME_ERROR;
    if (!phoneLooksValid(phoneValue)) errors.phone = PHONE_ERROR;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return; // block double submit
    setFormError(null);
    setSuccess(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstNameValue.trim(),
          lastName: lastNameValue.trim(),
          phone: phoneValue.trim() === '' ? null : phoneValue.trim(),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          firstName?: string;
          lastName?: string;
          phone?: string | null;
        };
        const next = {
          firstName: data.firstName ?? firstNameValue.trim(),
          lastName: data.lastName ?? lastNameValue.trim(),
          phone: typeof data.phone === 'string' ? data.phone : null,
        };
        // Reflect the server's canonical values everywhere.
        setSaved(next);
        setFirstNameValue(next.firstName);
        setLastNameValue(next.lastName);
        setPhoneValue(next.phone ?? '');
        setEditing(false);
        setSuccess(SUCCESS);
        // Refresh server components (header greeting, etc.) without a full reload.
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
      // Keep the values the user typed — do not discard their edits on error.
      setFormError(message);
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (invalid: boolean) =>
    `w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
      invalid
        ? 'border-red-300 focus:border-red-400'
        : 'border-stone-200 focus:border-stone-400'
    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`;

  const labelClass =
    'block text-xs font-medium tracking-[0.1em] uppercase text-stone-500 mb-2';

  return (
    <div className="bg-stone-50 rounded-sm p-8 mb-8">
      <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-stone-400 mb-6">
        Perfil
      </h2>

      {/* Success message (read mode, after a save) */}
      <div aria-live="polite" aria-atomic="true">
        {success && !editing && (
          <div className="bg-green-50 border border-green-200 rounded-sm p-3 mb-6">
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}
      </div>

      {!editing ? (
        // ── Read mode ──────────────────────────────────────────────────────────
        <>
          <dl className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:gap-8">
              <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
                Nombre
              </dt>
              <dd className="text-sm text-stone-900">{saved.firstName}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-8">
              <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
                Apellidos
              </dt>
              <dd className="text-sm text-stone-900">{saved.lastName}</dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-8">
              <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
                Email
              </dt>
              <dd className="text-sm text-stone-900 flex-1">
                <span className="block mb-3">{email}</span>
                <EmailVerificationStatus verified={emailVerified} />
                <EmailChangeSection pendingEmailChange={pendingEmailChange} />
              </dd>
            </div>
            <div className="flex flex-col sm:flex-row sm:gap-8">
              <dt className="text-xs font-medium tracking-[0.1em] uppercase text-stone-500 sm:w-32 flex-shrink-0 mb-1 sm:mb-0">
                Teléfono
              </dt>
              <dd className="text-sm text-stone-900">
                {saved.phone ?? 'No indicado'}
              </dd>
            </div>
          </dl>

          <div className="mt-6">
            <button
              type="button"
              onClick={startEditing}
              className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
            >
              Editar perfil
            </button>
          </div>
        </>
      ) : (
        // ── Edit mode ──────────────────────────────────────────────────────────
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Error banner */}
          <div aria-live="assertive" aria-atomic="true">
            {formError && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 rounded-sm p-4"
              >
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="profile-firstName" className={labelClass}>
              Nombre
            </label>
            <input
              id="profile-firstName"
              type="text"
              value={firstNameValue}
              onChange={(e) => setFirstNameValue(e.target.value)}
              autoComplete="given-name"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={
                fieldErrors.firstName ? 'profile-firstName-error' : undefined
              }
              className={inputClass(Boolean(fieldErrors.firstName))}
            />
            {fieldErrors.firstName && (
              <p id="profile-firstName-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.firstName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="profile-lastName" className={labelClass}>
              Apellidos
            </label>
            <input
              id="profile-lastName"
              type="text"
              value={lastNameValue}
              onChange={(e) => setLastNameValue(e.target.value)}
              autoComplete="family-name"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={
                fieldErrors.lastName ? 'profile-lastName-error' : undefined
              }
              className={inputClass(Boolean(fieldErrors.lastName))}
            />
            {fieldErrors.lastName && (
              <p id="profile-lastName-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.lastName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="profile-email" className={labelClass}>
              Email
            </label>
            <input
              id="profile-email"
              type="email"
              value={email}
              readOnly
              disabled
              aria-disabled="true"
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-sm bg-stone-100 text-stone-500 cursor-not-allowed"
            />
            <div className="mt-3">
              <EmailVerificationStatus verified={emailVerified} />
            </div>
          </div>

          <div>
            <label htmlFor="profile-phone" className={labelClass}>
              Teléfono <span className="text-stone-400 lowercase">(opcional)</span>
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={phoneValue}
              onChange={(e) => setPhoneValue(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+34 612 345 678"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={
                fieldErrors.phone ? 'profile-phone-error' : 'profile-phone-hint'
              }
              className={inputClass(Boolean(fieldErrors.phone))}
            />
            {fieldErrors.phone ? (
              <p id="profile-phone-error" className="text-xs text-red-600 mt-1">
                {fieldErrors.phone}
              </p>
            ) : (
              <p id="profile-phone-hint" className="text-xs text-stone-400 mt-1">
                Formato internacional, por ejemplo +34 612 345 678.
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
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
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
