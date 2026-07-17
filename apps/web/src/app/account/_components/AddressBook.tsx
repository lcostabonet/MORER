'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressType, CustomerAddress } from '@/lib/address-types';

interface AddressBookProps {
  addresses: CustomerAddress[];
}

const TYPE_LABEL: Record<AddressType, string> = {
  SHIPPING: 'Envío',
  BILLING: 'Facturación',
  BOTH: 'Envío y facturación',
};

const GENERIC_ERROR = 'No se ha podido procesar la solicitud. Inténtalo de nuevo.';

function canShip(type: AddressType): boolean {
  return type === 'SHIPPING' || type === 'BOTH';
}
function canBill(type: AddressType): boolean {
  return type === 'BILLING' || type === 'BOTH';
}

// Client mirror of the server's phone acceptance rule (optional; '+' + 8–15 digits).
function phoneLooksValid(raw: string): boolean {
  const t = raw.trim();
  if (t === '') return true;
  if (!t.startsWith('+')) return false;
  const digits = t.slice(1).replace(/[\s\-()]/g, '');
  return /^\d{8,15}$/.test(digits);
}

interface FormState {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  province: string;
  type: AddressType;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}

const EMPTY_FORM: FormState = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  province: '',
  type: 'SHIPPING',
  isDefaultShipping: false,
  isDefaultBilling: false,
};

export function AddressBook({ addresses }: AddressBookProps) {
  const router = useRouter();

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [success, setSuccess] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // a card action is in flight

  function startCreate() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setListError(null);
    setEditingId(null);
    setMode('create');
  }

  function startEdit(a: CustomerAddress) {
    setForm({
      fullName: a.fullName,
      phone: a.phone ?? '',
      line1: a.line1,
      line2: a.line2 ?? '',
      postalCode: a.postalCode,
      city: a.city,
      province: a.province,
      type: a.type,
      isDefaultShipping: a.isDefaultShipping,
      isDefaultBilling: a.isDefaultBilling,
    });
    setFieldErrors({});
    setFormError(null);
    setSuccess(null);
    setListError(null);
    setEditingId(a.id);
    setMode('edit');
  }

  function cancel() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setEditingId(null);
    setMode('list');
  }

  function changeType(type: AddressType) {
    setForm((f) => ({
      ...f,
      type,
      isDefaultShipping: canShip(type) ? f.isDefaultShipping : false,
      isDefaultBilling: canBill(type) ? f.isDefaultBilling : false,
    }));
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (form.fullName.trim() === '') errors.fullName = 'Introduce el nombre completo.';
    if (form.line1.trim() === '') errors.line1 = 'Introduce la dirección.';
    if (!/^\d{5}$/.test(form.postalCode.trim())) {
      errors.postalCode = 'El código postal debe tener 5 dígitos.';
    }
    if (form.city.trim() === '') errors.city = 'Introduce la ciudad.';
    if (form.province.trim() === '') errors.province = 'Introduce la provincia.';
    if (!phoneLooksValid(form.phone)) {
      errors.phone = 'Introduce un teléfono internacional válido, por ejemplo +34 612 345 678.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setFormError(null);
    if (!validate()) return;

    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim() === '' ? null : form.phone.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim() === '' ? null : form.line2.trim(),
      postalCode: form.postalCode.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      type: form.type,
      isDefaultShipping: canShip(form.type) && form.isDefaultShipping,
      isDefaultBilling: canBill(form.type) && form.isDefaultBilling,
    };

    const isEdit = mode === 'edit' && editingId !== null;
    const url = isEdit
      ? `/api/account/addresses/${editingId}`
      : '/api/account/addresses';

    setLoading(true);
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMode('list');
        setEditingId(null);
        setForm(EMPTY_FORM);
        setSuccess(
          isEdit
            ? 'Dirección actualizada correctamente.'
            : 'Dirección guardada correctamente.',
        );
        router.refresh();
        return;
      }

      let message = GENERIC_ERROR;
      try {
        const data = (await res.json()) as { error?: string };
        if (typeof data.error === 'string' && data.error.length > 0) message = data.error;
      } catch {
        // keep generic
      }
      setFormError(message);
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(
    url: string,
    method: 'POST' | 'DELETE',
    successMessage: string,
  ) {
    if (busy) return;
    setListError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const res = await fetch(url, { method });
      if (res.ok) {
        setSuccess(successMessage);
        router.refresh();
        return;
      }
      setListError(GENERIC_ERROR);
    } catch {
      setListError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta dirección?')) return;
    void runAction(
      `/api/account/addresses/${id}`,
      'DELETE',
      'Dirección eliminada correctamente.',
    );
  }

  function handleDefaultShipping(id: string) {
    void runAction(
      `/api/account/addresses/${id}/default-shipping`,
      'POST',
      'Dirección marcada como predeterminada de envío.',
    );
  }

  function handleDefaultBilling(id: string) {
    void runAction(
      `/api/account/addresses/${id}/default-billing`,
      'POST',
      'Dirección marcada como predeterminada de facturación.',
    );
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
        Direcciones
      </h2>

      <div aria-live="polite" aria-atomic="true">
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-sm p-3 mb-4">
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {listError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-sm p-3 mb-4">
            <p className="text-sm text-red-700">{listError}</p>
          </div>
        )}
      </div>

      {mode === 'list' && (
        <>
          {addresses.length === 0 ? (
            <p className="text-sm text-stone-500 mb-6">
              Aún no tienes direcciones guardadas.
            </p>
          ) : (
            <ul className="space-y-4 mb-6">
              {addresses.map((a) => (
                <li key={a.id} className="border border-stone-200 rounded-sm p-4 bg-white">
                  <p className="text-sm font-medium text-stone-900">{a.fullName}</p>
                  <p className="text-sm text-stone-700">{a.line1}</p>
                  {a.line2 && <p className="text-sm text-stone-700">{a.line2}</p>}
                  <p className="text-sm text-stone-700">
                    {a.postalCode} {a.city}, {a.province}
                  </p>
                  <p className="text-sm text-stone-700">España</p>
                  {a.phone && <p className="text-sm text-stone-500 mt-1">{a.phone}</p>}
                  <p className="text-xs text-stone-500 mt-2">Tipo: {TYPE_LABEL[a.type]}</p>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {a.isDefaultShipping && (
                      <span className="text-xs px-2 py-0.5 bg-stone-900 text-white rounded-sm">
                        Predeterminada de envío
                      </span>
                    )}
                    {a.isDefaultBilling && (
                      <span className="text-xs px-2 py-0.5 bg-stone-700 text-white rounded-sm">
                        Predeterminada de facturación
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mt-4">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      disabled={busy}
                      className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      disabled={busy}
                      className="text-xs font-medium tracking-[0.15em] uppercase text-red-700 underline underline-offset-2 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                    {canShip(a.type) && !a.isDefaultShipping && (
                      <button
                        type="button"
                        onClick={() => handleDefaultShipping(a.id)}
                        disabled={busy}
                        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-500 underline underline-offset-2 hover:text-stone-900 transition-colors disabled:opacity-50"
                      >
                        Marcar como predeterminada de envío
                      </button>
                    )}
                    {canBill(a.type) && !a.isDefaultBilling && (
                      <button
                        type="button"
                        onClick={() => handleDefaultBilling(a.id)}
                        disabled={busy}
                        className="text-xs font-medium tracking-[0.15em] uppercase text-stone-500 underline underline-offset-2 hover:text-stone-900 transition-colors disabled:opacity-50"
                      >
                        Marcar como predeterminada de facturación
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={startCreate}
            className="text-xs font-medium tracking-[0.15em] uppercase text-stone-900 underline underline-offset-2 hover:text-stone-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          >
            Añadir dirección
          </button>
        </>
      )}

      {(mode === 'create' || mode === 'edit') && (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div aria-live="assertive" aria-atomic="true">
            {formError && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-sm p-4">
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="addr-fullName" className={labelClass}>Nombre completo</label>
            <input
              id="addr-fullName"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              autoComplete="name"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.fullName)}
              className={inputClass(Boolean(fieldErrors.fullName))}
            />
            {fieldErrors.fullName && <p className="text-xs text-red-600 mt-1">{fieldErrors.fullName}</p>}
          </div>

          <div>
            <label htmlFor="addr-phone" className={labelClass}>Teléfono (opcional)</label>
            <input
              id="addr-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+34 612 345 678"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.phone)}
              className={inputClass(Boolean(fieldErrors.phone))}
            />
            {fieldErrors.phone && <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
          </div>

          <div>
            <label htmlFor="addr-line1" className={labelClass}>Dirección línea 1</label>
            <input
              id="addr-line1"
              type="text"
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              autoComplete="address-line1"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.line1)}
              className={inputClass(Boolean(fieldErrors.line1))}
            />
            {fieldErrors.line1 && <p className="text-xs text-red-600 mt-1">{fieldErrors.line1}</p>}
          </div>

          <div>
            <label htmlFor="addr-line2" className={labelClass}>Dirección línea 2 (opcional)</label>
            <input
              id="addr-line2"
              type="text"
              value={form.line2}
              onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
              autoComplete="address-line2"
              disabled={loading}
              className={inputClass(false)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="addr-postalCode" className={labelClass}>Código postal</label>
              <input
                id="addr-postalCode"
                type="text"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                autoComplete="postal-code"
                inputMode="numeric"
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.postalCode)}
                className={inputClass(Boolean(fieldErrors.postalCode))}
              />
              {fieldErrors.postalCode && <p className="text-xs text-red-600 mt-1">{fieldErrors.postalCode}</p>}
            </div>
            <div className="flex-1">
              <label htmlFor="addr-city" className={labelClass}>Ciudad</label>
              <input
                id="addr-city"
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                autoComplete="address-level2"
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.city)}
                className={inputClass(Boolean(fieldErrors.city))}
              />
              {fieldErrors.city && <p className="text-xs text-red-600 mt-1">{fieldErrors.city}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="addr-province" className={labelClass}>Provincia</label>
            <input
              id="addr-province"
              type="text"
              value={form.province}
              onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
              autoComplete="address-level1"
              disabled={loading}
              aria-invalid={Boolean(fieldErrors.province)}
              className={inputClass(Boolean(fieldErrors.province))}
            />
            {fieldErrors.province && <p className="text-xs text-red-600 mt-1">{fieldErrors.province}</p>}
          </div>

          <div>
            <label htmlFor="addr-country" className={labelClass}>País</label>
            <input
              id="addr-country"
              type="text"
              value="España"
              readOnly
              disabled
              aria-disabled="true"
              className="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-sm bg-stone-100 text-stone-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="addr-type" className={labelClass}>Tipo de dirección</label>
            <select
              id="addr-type"
              value={form.type}
              onChange={(e) => changeType(e.target.value as AddressType)}
              disabled={loading}
              className={inputClass(false)}
            >
              <option value="SHIPPING">Envío</option>
              <option value="BILLING">Facturación</option>
              <option value="BOTH">Envío y facturación</option>
            </select>
          </div>

          <div className="space-y-2">
            {canShip(form.type) && (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={form.isDefaultShipping}
                  onChange={(e) => setForm((f) => ({ ...f, isDefaultShipping: e.target.checked }))}
                  disabled={loading}
                />
                Predeterminada de envío
              </label>
            )}
            {canBill(form.type) && (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={form.isDefaultBilling}
                  onChange={(e) => setForm((f) => ({ ...f, isDefaultBilling: e.target.checked }))}
                  disabled={loading}
                />
                Predeterminada de facturación
              </label>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2.5 text-xs font-medium tracking-[0.15em] uppercase transition-colors ${
                loading ? 'bg-stone-200 text-stone-400 cursor-not-allowed' : 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
              }`}
            >
              {loading ? 'Guardando...' : 'Guardar dirección'}
            </button>
            <button
              type="button"
              onClick={cancel}
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
