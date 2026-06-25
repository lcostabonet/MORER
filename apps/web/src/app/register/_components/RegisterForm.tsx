'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type FormError =
  | 'email_already_registered'
  | 'invalid_data'
  | 'too_many_requests'
  | 'requires_login'
  | 'service_error'
  | null;

export function RegisterForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<FormError>(null);

  // Per-field touched state for inline validation
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [firstNameTouched, setFirstNameTouched] = useState(false);
  const [lastNameTouched, setLastNameTouched] = useState(false);

  const emailInvalid = emailTouched && (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 254);
  const passwordInvalid = passwordTouched && (password.length < 8 || password.length > 72);
  const firstNameInvalid = firstNameTouched && firstName.trim() === '';
  const lastNameInvalid = lastNameTouched && lastName.trim() === '';

  const canSubmit =
    !loading &&
    EMAIL_REGEX.test(email.trim()) &&
    email.trim().length <= 254 &&
    password.length >= 8 &&
    password.length <= 72 &&
    firstName.trim() !== '' &&
    lastName.trim() !== '';

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { success: boolean; requiresLogin?: boolean };
        if (data.requiresLogin) {
          setFormError('requires_login');
          setLoading(false);
          return;
        }
        router.replace('/account');
        router.refresh();
        return;
      }

      const errData = (await res.json().catch(() => ({}))) as { error?: string };

      if (res.status === 409) {
        setFormError('email_already_registered');
      } else if (res.status === 400) {
        setFormError('invalid_data');
      } else if (res.status === 429) {
        setFormError('too_many_requests');
      } else {
        setFormError('service_error');
      }

      // Consume to avoid lint warnings
      void errData;
    } catch {
      setFormError('service_error');
    } finally {
      setLoading(false);
    }
  }

  if (formError === 'requires_login') {
    return (
      <div
        className="bg-amber-50 border border-amber-200 rounded-sm p-6"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-medium text-amber-800 mb-2">Cuenta creada.</p>
        <p className="text-sm text-amber-700 mb-4">
          Por favor inicia sesión para continuar.
        </p>
        <Link
          href="/login"
          className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Error banner */}
      <div aria-live="polite" aria-atomic="true">
        {formError === 'email_already_registered' && (
          <div id="form-error" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">
              Este email ya está registrado.{' '}
              <Link href="/login" className="underline underline-offset-2 hover:text-red-900">
                Iniciar sesión
              </Link>
            </p>
          </div>
        )}
        {formError === 'invalid_data' && (
          <div id="form-error" className="bg-red-50 border border-red-200 rounded-sm p-4">
            <p className="text-sm text-red-700">Datos inválidos. Revisa los campos.</p>
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

      {/* First Name */}
      <div>
        <label
          htmlFor="register-firstName"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Nombre
        </label>
        <input
          id="register-firstName"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onBlur={() => setFirstNameTouched(true)}
          autoComplete="given-name"
          disabled={loading}
          aria-describedby={firstNameInvalid ? 'firstName-error' : undefined}
          aria-invalid={firstNameInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            firstNameInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="Marc"
        />
        {firstNameInvalid && (
          <p id="firstName-error" className="text-xs text-red-600 mt-1">
            El nombre es obligatorio.
          </p>
        )}
      </div>

      {/* Last Name */}
      <div>
        <label
          htmlFor="register-lastName"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Apellidos
        </label>
        <input
          id="register-lastName"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          onBlur={() => setLastNameTouched(true)}
          autoComplete="family-name"
          disabled={loading}
          aria-describedby={lastNameInvalid ? 'lastName-error' : undefined}
          aria-invalid={lastNameInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            lastNameInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="Roca"
        />
        {lastNameInvalid && (
          <p id="lastName-error" className="text-xs text-red-600 mt-1">
            Los apellidos son obligatorios.
          </p>
        )}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="register-email"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Email
        </label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          autoComplete="email"
          disabled={loading}
          aria-describedby={emailInvalid ? 'email-error' : undefined}
          aria-invalid={emailInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            emailInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          placeholder="tu@email.com"
        />
        {emailInvalid && (
          <p id="email-error" className="text-xs text-red-600 mt-1">
            Introduce un email válido.
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label
          htmlFor="register-password"
          className="block text-xs font-medium tracking-[0.1em] uppercase text-stone-600 mb-2"
        >
          Contraseña
        </label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          autoComplete="new-password"
          disabled={loading}
          aria-describedby={passwordInvalid ? 'password-error' : 'password-hint'}
          aria-invalid={passwordInvalid}
          className={`w-full px-3 py-2.5 text-sm border rounded-sm bg-white text-stone-900 placeholder-stone-300 outline-none transition-colors ${
            passwordInvalid
              ? 'border-red-300 focus:border-red-400'
              : 'border-stone-200 focus:border-stone-400'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        {passwordInvalid ? (
          <p id="password-error" className="text-xs text-red-600 mt-1">
            La contraseña debe tener entre 8 y 72 caracteres.
          </p>
        ) : (
          <p id="password-hint" className="text-xs text-stone-400 mt-1">
            Mínimo 8 caracteres.
          </p>
        )}
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
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>

      <p className="text-xs text-stone-500 text-center">
        ¿Ya tienes cuenta?{' '}
        <Link
          href="/login"
          className="text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors"
        >
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}
