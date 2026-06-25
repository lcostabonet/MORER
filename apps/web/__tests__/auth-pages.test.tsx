/**
 * Component tests for Phase 11A-beta auth page components.
 *
 * Uses @testing-library/react + jsdom.
 * next/navigation is mocked so useRouter does not throw outside Next.js.
 * global fetch is mocked with vi.fn() per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ─── Mock next/navigation ────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ─── Mock next/link ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}));

// ─── RegisterForm ────────────────────────────────────────────────────────────

describe('RegisterForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(async () => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderRegisterForm() {
    const { RegisterForm } = await import('@/app/register/_components/RegisterForm');
    return render(React.createElement(RegisterForm));
  }

  it('renders all four fields with correct labels', async () => {
    await renderRegisterForm();

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it('firstName input has autocomplete="given-name"', async () => {
    await renderRegisterForm();
    const input = screen.getByLabelText(/nombre/i);
    expect(input).toHaveAttribute('autocomplete', 'given-name');
  });

  it('lastName input has autocomplete="family-name"', async () => {
    await renderRegisterForm();
    const input = screen.getByLabelText(/apellidos/i);
    expect(input).toHaveAttribute('autocomplete', 'family-name');
  });

  it('email input has autocomplete="email"', async () => {
    await renderRegisterForm();
    const input = screen.getByLabelText(/email/i);
    expect(input).toHaveAttribute('autocomplete', 'email');
  });

  it('password input has autocomplete="new-password"', async () => {
    await renderRegisterForm();
    const input = screen.getByLabelText(/contraseña/i);
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows inline error after blurring password field with < 8 chars', async () => {
    await renderRegisterForm();

    const passwordInput = screen.getByLabelText(/contraseña/i);
    await user.click(passwordInput);
    await user.type(passwordInput, 'short');
    await user.tab(); // trigger blur

    expect(
      await screen.findByText(/entre 8 y 72 caracteres/i),
    ).toBeInTheDocument();
  });

  it('shows inline error when password exceeds 72 characters', async () => {
    await renderRegisterForm();

    const passwordInput = screen.getByLabelText(/contraseña/i);
    await user.click(passwordInput);
    await user.type(passwordInput, 'a'.repeat(73));
    await user.tab();

    expect(
      await screen.findByText(/entre 8 y 72 caracteres/i),
    ).toBeInTheDocument();
  });

  it('password field has aria-invalid=true when invalid and aria-describedby points to error', async () => {
    await renderRegisterForm();

    const passwordInput = screen.getByLabelText(/contraseña/i);
    await user.click(passwordInput);
    await user.type(passwordInput, 'bad');
    await user.tab();

    await waitFor(() => {
      expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    });
    expect(passwordInput).toHaveAttribute('aria-describedby', 'password-error');
  });

  it('submit button shows loading text while request is in flight', async () => {
    // Delay fetch resolution so we can observe the loading state
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.mocked(fetch).mockReturnValueOnce(fetchPromise);

    await renderRegisterForm();

    // Fill all fields with valid values
    await user.type(screen.getByLabelText(/nombre/i), 'Joan');
    await user.type(screen.getByLabelText(/apellidos/i), 'Costa');
    await user.type(screen.getByLabelText(/email/i), 'joan@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');

    const submitBtn = screen.getByRole('button', { name: /crear cuenta/i });
    await user.click(submitBtn);

    // While fetch is still pending the button should show loading text
    expect(screen.getByRole('button', { name: /creando cuenta/i })).toBeInTheDocument();

    // Resolve the fetch so the component cleans up
    resolveFetch(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /creando cuenta/i })).not.toBeInTheDocument();
    });
  });

  it('shows email_already_registered error banner on 409 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Email already registered' }), { status: 409 }),
    );

    await renderRegisterForm();

    await user.type(screen.getByLabelText(/nombre/i), 'Joan');
    await user.type(screen.getByLabelText(/apellidos/i), 'Costa');
    await user.type(screen.getByLabelText(/email/i), 'joan@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');

    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText(/ya está registrado/i)).toBeInTheDocument();
  });

  it('error banner container has aria-live="polite"', async () => {
    await renderRegisterForm();
    // The aria-live container exists from the start (before any error)
    const liveRegions = document.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBeGreaterThan(0);
    const hasPolite = Array.from(liveRegions).some(
      (el) => el.getAttribute('aria-live') === 'polite',
    );
    expect(hasPolite).toBe(true);
  });

  it('each input has a label with htmlFor matching the input id', async () => {
    await renderRegisterForm();

    const pairs = [
      { labelText: /nombre/i, inputId: 'register-firstName' },
      { labelText: /apellidos/i, inputId: 'register-lastName' },
      { labelText: /email/i, inputId: 'register-email' },
      { labelText: /contraseña/i, inputId: 'register-password' },
    ];

    for (const { labelText, inputId } of pairs) {
      const label = screen.getByText(labelText, { selector: 'label' });
      expect(label).toHaveAttribute('for', inputId);
      expect(document.getElementById(inputId)).toBeInTheDocument();
    }
  });
});

// ─── LoginForm ───────────────────────────────────────────────────────────────

describe('LoginForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(async () => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderLoginForm(next: string | null = null) {
    const { LoginForm } = await import('@/app/login/_components/LoginForm');
    return render(React.createElement(LoginForm, { next }));
  }

  it('renders email and password fields', async () => {
    await renderLoginForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it('email input has autocomplete="email"', async () => {
    await renderLoginForm();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email');
  });

  it('password input has autocomplete="current-password"', async () => {
    await renderLoginForm();
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('autocomplete', 'current-password');
  });

  it('shows generic "Email o contraseña incorrectos." on 401 — no enumeration', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
    );

    await renderLoginForm();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    const errorMessage = await screen.findByText(/email o contraseña incorrectos/i);
    expect(errorMessage).toBeInTheDocument();

    // Must not expose which part was wrong
    expect(screen.queryByText(/email no encontrado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contraseña incorrecta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/usuario no existe/i)).not.toBeInTheDocument();
  });

  it('error banner does not reveal whether email exists (generic message only)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
    );

    await renderLoginForm();

    await user.type(screen.getByLabelText(/email/i), 'unknown@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'anypassword123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await screen.findByText(/email o contraseña incorrectos/i);
    // There must be only one error message text
    const errors = screen.getAllByText(/incorrectos/i);
    expect(errors).toHaveLength(1);
  });

  it('shows loading state while submitting', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.mocked(fetch).mockReturnValueOnce(fetchPromise);

    await renderLoginForm();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(screen.getByRole('button', { name: /iniciando sesión/i })).toBeInTheDocument();

    resolveFetch(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /iniciando sesión/i })).not.toBeInTheDocument();
    });
  });

  it('error banner has aria-live="polite"', async () => {
    await renderLoginForm();
    const liveRegions = document.querySelectorAll('[aria-live]');
    expect(liveRegions.length).toBeGreaterThan(0);
    const hasPolite = Array.from(liveRegions).some(
      (el) => el.getAttribute('aria-live') === 'polite',
    );
    expect(hasPolite).toBe(true);
  });

  it('label htmlFor matches input id for both fields', async () => {
    await renderLoginForm();

    const emailLabel = screen.getByText(/email/i, { selector: 'label' });
    expect(emailLabel).toHaveAttribute('for', 'login-email');
    expect(document.getElementById('login-email')).toBeInTheDocument();

    const passwordLabel = screen.getByText(/contraseña/i, { selector: 'label' });
    expect(passwordLabel).toHaveAttribute('for', 'login-password');
    expect(document.getElementById('login-password')).toBeInTheDocument();
  });

  it('submit button is disabled when fields are empty', async () => {
    await renderLoginForm();
    const btn = screen.getByRole('button', { name: /iniciar sesión/i });
    expect(btn).toBeDisabled();
  });

  it('rejects external next param on client side (safeNext defaults to /account)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    // Pass an external URL as next param
    await renderLoginForm('//evil.com');

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      // Should redirect to /account, not to the evil URL
      expect(mockPush).toHaveBeenCalledWith('/account');
      expect(mockPush).not.toHaveBeenCalledWith('//evil.com');
    });
  });
});
