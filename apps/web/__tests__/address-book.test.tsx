/**
 * Component tests for Phase 11D AddressBook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { CustomerAddress } from '@/lib/address-types';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mockRefresh }),
}));

function addr(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id: 'a1',
    fullName: 'Ana García',
    phone: null,
    line1: 'Calle Mayor 1',
    line2: null,
    postalCode: '28001',
    city: 'Madrid',
    province: 'Madrid',
    countryCode: 'ES',
    type: 'SHIPPING',
    isDefaultShipping: false,
    isDefaultBilling: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderBook(addresses: CustomerAddress[]) {
  const { AddressBook } = await import('@/app/account/_components/AddressBook');
  return render(React.createElement(AddressBook, { addresses }));
}

describe('AddressBook', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function openAddForm() {
    await user.click(screen.getByRole('button', { name: /añadir dirección/i }));
  }

  async function fillValidForm() {
    await user.type(screen.getByLabelText('Nombre completo'), 'Ana García');
    await user.type(screen.getByLabelText('Dirección línea 1'), 'Calle Mayor 1');
    await user.type(screen.getByLabelText('Código postal'), '28001');
    await user.type(screen.getByLabelText('Ciudad'), 'Madrid');
    await user.type(screen.getByLabelText('Provincia'), 'Madrid');
  }

  it('shows the empty state and an "Añadir dirección" button', async () => {
    await renderBook([]);
    expect(screen.getByText('Aún no tienes direcciones guardadas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /añadir dirección/i })).toBeInTheDocument();
  });

  it('renders a card with the address fields, type label and default badges', async () => {
    await renderBook([
      addr({ type: 'BOTH', phone: '+34612345678', isDefaultShipping: true, isDefaultBilling: true }),
    ]);
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('Calle Mayor 1')).toBeInTheDocument();
    expect(screen.getByText('28001 Madrid, Madrid')).toBeInTheDocument();
    expect(screen.getByText('España')).toBeInTheDocument();
    expect(screen.getByText('+34612345678')).toBeInTheDocument();
    expect(screen.getByText('Tipo: Envío y facturación')).toBeInTheDocument();
    expect(screen.getByText('Predeterminada de envío')).toBeInTheDocument();
    expect(screen.getByText('Predeterminada de facturación')).toBeInTheDocument();
  });

  it('opens the form with country España fixed and no company/NIF fields', async () => {
    await renderBook([]);
    await openAddForm();

    expect(screen.getByLabelText('Nombre completo')).toBeInTheDocument();
    expect(screen.getByLabelText('Dirección línea 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de dirección')).toBeInTheDocument();

    const country = screen.getByLabelText('País');
    expect(country).toHaveValue('España');
    expect(country).toBeDisabled();

    // Out-of-scope fields must not exist
    expect(screen.queryByLabelText(/empresa/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nif|dni|cif/i)).not.toBeInTheDocument();
  });

  it('validates required fields and postal code without calling the API', async () => {
    await renderBook([]);
    await openAddForm();
    await user.type(screen.getByLabelText('Código postal'), '123');
    await user.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(await screen.findByText('Introduce el nombre completo.')).toBeInTheDocument();
    expect(screen.getByText('El código postal debe tener 5 dígitos.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates an address and refreshes on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1' }), { status: 201 }));
    await renderBook([]);
    await openAddForm();
    await fillValidForm();
    await user.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(await screen.findByText('Dirección guardada correctamente.')).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/addresses');
    expect(options.method).toBe('POST');
    const sent = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(sent.fullName).toBe('Ana García');
    expect(sent).not.toHaveProperty('customerId');
  });

  it('edits an existing address via PATCH', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1' }), { status: 200 }));
    await renderBook([addr()]);
    await user.click(screen.getByRole('button', { name: /^editar$/i }));

    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Ana García');
    const city = screen.getByLabelText('Ciudad');
    await user.clear(city);
    await user.type(city, 'Sevilla');
    await user.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(await screen.findByText('Dirección actualizada correctamente.')).toBeInTheDocument();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/addresses/a1');
    expect(options.method).toBe('PATCH');
  });

  it('cancel returns to the list without calling the API', async () => {
    await renderBook([addr()]);
    await user.click(screen.getByRole('button', { name: /^editar$/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(screen.getByRole('button', { name: /añadir dirección/i })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes only after confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await renderBook([addr()]);
    await user.click(screen.getByRole('button', { name: /^eliminar$/i }));
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await user.click(screen.getByRole('button', { name: /^eliminar$/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/addresses/a1');
    expect(options.method).toBe('DELETE');
  });

  it('marks default shipping via its endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1' }), { status: 200 }));
    await renderBook([addr({ type: 'SHIPPING', isDefaultShipping: false })]);
    await user.click(screen.getByRole('button', { name: /marcar como predeterminada de envío/i }));

    expect(await screen.findByText('Dirección marcada como predeterminada de envío.')).toBeInTheDocument();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/account/addresses/a1/default-shipping');
    expect(options.method).toBe('POST');
  });

  it('only shows actions compatible with the address type', async () => {
    await renderBook([
      addr({ id: 's', type: 'SHIPPING' }),
      addr({ id: 'b', type: 'BILLING' }),
    ]);
    // A SHIPPING address offers the shipping default action, not the billing one.
    expect(screen.getByRole('button', { name: /marcar como predeterminada de envío/i })).toBeInTheDocument();
    // A BILLING address offers billing, not shipping — exactly one of each exists.
    expect(screen.getAllByRole('button', { name: /marcar como predeterminada de envío/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /marcar como predeterminada de facturación/i })).toHaveLength(1);
  });

  it('only shows the default checkbox compatible with the selected type', async () => {
    await renderBook([]);
    await openAddForm();
    // Default type SHIPPING → shipping checkbox present, billing absent.
    expect(screen.getByRole('checkbox', { name: /predeterminada de envío/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /predeterminada de facturación/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de dirección'), 'BILLING');
    expect(screen.queryByRole('checkbox', { name: /predeterminada de envío/i })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /predeterminada de facturación/i })).toBeInTheDocument();
  });

  it('blocks a double submit while creating', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((r) => { resolveFetch = r; }) as unknown as ReturnType<typeof fetch>,
    );
    await renderBook([]);
    await openAddForm();
    await fillValidForm();
    await user.click(screen.getByRole('button', { name: /guardar dirección/i }));

    const inFlight = screen.getByRole('button', { name: /guardando/i });
    expect(inFlight).toBeDisabled();
    await user.click(inFlight);

    resolveFetch(new Response(JSON.stringify({ id: 'a1' }), { status: 201 }));
    await screen.findByText('Dirección guardada correctamente.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps typed values and shows an error when the server rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Por ahora solo se admiten direcciones de España.' }), { status: 400 }),
    );
    await renderBook([]);
    await openAddForm();
    await fillValidForm();
    await user.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(await screen.findByText(/solo se admiten direcciones de españa/i)).toBeInTheDocument();
    // Form still open with the typed values preserved
    expect(screen.getByLabelText('Ciudad')).toHaveValue('Madrid');
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
