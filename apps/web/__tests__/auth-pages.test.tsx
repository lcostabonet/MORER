/**
 * Component tests for Phase 11A-gamma auth page components.
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
const mockReplace = vi.fn();
const mockRefresh = vi.fn();
const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: mockRefresh }),
  redirect: (...args: unknown[]) => mockRedirect(...args),
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
    mockReplace.mockReset();
    mockRefresh.mockReset();
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

  it('navigates to /account and calls router.refresh() on successful registration with auto-login', async () => {
    // First fetch: register succeeds
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderRegisterForm();

    await user.type(screen.getByLabelText(/nombre/i), 'Joan');
    await user.type(screen.getByLabelText(/apellidos/i), 'Costa');
    await user.type(screen.getByLabelText(/email/i), 'joan@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/account');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ─── LoginForm ───────────────────────────────────────────────────────────────

describe('LoginForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(async () => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
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
      // Should redirect to /account, not to the evil URL — uses replace, not push
      expect(mockReplace).toHaveBeenCalledWith('/account');
      expect(mockReplace).not.toHaveBeenCalledWith('//evil.com');
    });
  });

  it('navigates to safeNext and calls router.refresh() on successful login', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderLoginForm('/account');

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'password123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/account');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
    // Must use replace, not push, to prevent the login page from stacking in history
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders a link to /forgot-password', async () => {
    await renderLoginForm();

    // The LoginForm renders a "¿Has olvidado tu contraseña?" link pointing to /forgot-password
    const forgotLink = screen.getByRole('link', { name: /olvidado tu contraseña/i });
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink).toHaveAttribute('href', '/forgot-password');
  });
});

// ─── ForgotPasswordForm ──────────────────────────────────────────────────────

describe('ForgotPasswordForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderForgotPasswordForm() {
    const { ForgotPasswordForm } = await import(
      '@/app/forgot-password/_components/ForgotPasswordForm'
    );
    return render(React.createElement(ForgotPasswordForm));
  }

  it('renders email field with autocomplete=email', async () => {
    await renderForgotPasswordForm();
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('autocomplete', 'email');
  });

  it('shows inline error on blur with invalid email format', async () => {
    await renderForgotPasswordForm();

    const input = screen.getByLabelText(/email/i);
    await user.click(input);
    await user.type(input, 'not-an-email');
    await user.tab(); // trigger blur

    expect(await screen.findByText(/email válido/i)).toBeInTheDocument();
  });

  it('submit button is disabled when email field is empty', async () => {
    await renderForgotPasswordForm();

    const btn = screen.getByRole('button', { name: /enviar instrucciones/i });
    expect(btn).toBeDisabled();
  });

  it('shows loading state while submitting', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(fetch).mockReturnValueOnce(fetchPromise);

    await renderForgotPasswordForm();

    const input = screen.getByLabelText(/email/i);
    await user.type(input, 'user@example.com');
    await user.click(screen.getByRole('button', { name: /enviar instrucciones/i }));

    expect(screen.getByRole('button', { name: /enviando/i })).toBeInTheDocument();

    resolveFetch(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /enviando/i })).not.toBeInTheDocument();
    });
  });

  it('shows generic success message after API success (200)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderForgotPasswordForm();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /enviar instrucciones/i }));

    // Generic message — same regardless of whether account exists
    expect(
      await screen.findByText(/si existe una cuenta/i),
    ).toBeInTheDocument();
  });

  it('shows same generic success message even when API returns an error (503)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Service error' }), { status: 503 }),
    );

    await renderForgotPasswordForm();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /enviar instrucciones/i }));

    // Same generic message — never reveals whether account exists
    expect(
      await screen.findByText(/si existe una cuenta/i),
    ).toBeInTheDocument();
  });

  it('shows same generic message even on network error (fetch rejects)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await renderForgotPasswordForm();

    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.click(screen.getByRole('button', { name: /enviar instrucciones/i }));

    expect(
      await screen.findByText(/si existe una cuenta/i),
    ).toBeInTheDocument();
  });
});

// ─── ResetPasswordForm ────────────────────────────────────────────────────────

describe('ResetPasswordForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderResetPasswordForm(token: string) {
    const { ResetPasswordForm } = await import(
      '@/app/reset-password/_components/ResetPasswordForm'
    );
    return render(React.createElement(ResetPasswordForm, { token }));
  }

  it('shows invalid link message when token prop is empty string', async () => {
    await renderResetPasswordForm('');

    expect(
      screen.getByText(/enlace de recuperación no válido/i),
    ).toBeInTheDocument();
    // The form itself should not be rendered
    expect(
      screen.queryByRole('button', { name: /cambiar contraseña/i }),
    ).not.toBeInTheDocument();
  });

  it('renders password fields with autocomplete=new-password', async () => {
    await renderResetPasswordForm('some-valid-token');

    // type=password inputs are not accessible via role="textbox" — use label query.
    const newPasswordInput = screen.getByLabelText(/nueva contraseña/i);
    const confirmInput = screen.getByLabelText(/confirmar contraseña/i);

    expect(newPasswordInput).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmInput).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows validation error when passwords do not match', async () => {
    await renderResetPasswordForm('some-valid-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'password123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'different456');
    await user.tab(); // blur confirm field

    expect(
      await screen.findByText(/contraseñas no coinciden/i),
    ).toBeInTheDocument();
  });

  it('shows validation error when password is too short (< 8 chars)', async () => {
    await renderResetPasswordForm('some-valid-token');

    const newPasswordInput = screen.getByLabelText(/nueva contraseña/i);
    await user.type(newPasswordInput, 'short');
    await user.tab(); // blur

    expect(
      await screen.findByText(/entre 8 y 72 caracteres/i),
    ).toBeInTheDocument();
  });

  it("calls router.replace('/login?reset=1') and router.refresh() on API success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderResetPasswordForm('some-valid-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login?reset=1');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the exact invalid-token message on 400 response', async () => {
    const EXPECTED = 'El enlace de recuperación no es válido o ha caducado.';
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: EXPECTED }), { status: 400 }),
    );

    await renderResetPasswordForm('some-valid-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    expect(await screen.findByText(EXPECTED)).toBeInTheDocument();
  });

  it('does not show "Unauthorized" when token is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'El enlace de recuperación no es válido o ha caducado.' }),
        { status: 400 },
      ),
    );

    await renderResetPasswordForm('used-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await screen.findByText(/enlace de recuperación/i);
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bad request/i)).not.toBeInTheDocument();
  });

  it('does not redirect to login when token is invalid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'El enlace de recuperación no es válido o ha caducado.' }),
        { status: 400 },
      ),
    );

    await renderResetPasswordForm('expired-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirmar contraseña/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /cambiar contraseña/i }));

    await screen.findByText(/enlace de recuperación/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // ── Show/hide passwords toggle ──────────────────────────────────────────────

  it('starts with both fields hidden (type=password) and "Mostrar contraseñas"', async () => {
    await renderResetPasswordForm('some-valid-token');

    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByLabelText(/confirmar contraseña/i)).toHaveAttribute(
      'type',
      'password',
    );
    expect(screen.getByText('Mostrar contraseñas')).toBeInTheDocument();
  });

  it('reveals both fields, swaps label, and preserves typed values when toggled on', async () => {
    await renderResetPasswordForm('some-valid-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      'newpassword123',
    );

    await user.click(
      screen.getByRole('button', { name: /mostrar las contraseñas/i }),
    );

    const newPasswordInput = screen.getByLabelText(/nueva contraseña/i);
    const confirmInput = screen.getByLabelText(/confirmar contraseña/i);
    expect(newPasswordInput).toHaveAttribute('type', 'text');
    expect(confirmInput).toHaveAttribute('type', 'text');
    expect(screen.getByText('Ocultar contraseñas')).toBeInTheDocument();
    // Values are not cleared by toggling visibility
    expect(newPasswordInput).toHaveValue('newpassword123');
    expect(confirmInput).toHaveValue('newpassword123');
  });

  it('hides both fields again on second toggle, still preserving values', async () => {
    await renderResetPasswordForm('some-valid-token');

    await user.type(screen.getByLabelText(/nueva contraseña/i), 'newpassword123');
    await user.type(
      screen.getByLabelText(/confirmar contraseña/i),
      'newpassword123',
    );

    await user.click(
      screen.getByRole('button', { name: /mostrar las contraseñas/i }),
    );
    await user.click(
      screen.getByRole('button', { name: /ocultar las contraseñas/i }),
    );

    const newPasswordInput = screen.getByLabelText(/nueva contraseña/i);
    const confirmInput = screen.getByLabelText(/confirmar contraseña/i);
    expect(newPasswordInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveAttribute('type', 'password');
    expect(screen.getByText('Mostrar contraseñas')).toBeInTheDocument();
    expect(newPasswordInput).toHaveValue('newpassword123');
    expect(confirmInput).toHaveValue('newpassword123');
  });

  it('toggle is a non-submitting button accessible by name with aria-pressed', async () => {
    await renderResetPasswordForm('some-valid-token');

    const toggle = screen.getByRole('button', {
      name: /mostrar las contraseñas/i,
    });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(
      screen.getByRole('button', { name: /ocultar las contraseñas/i }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps autocomplete=new-password on both fields after toggling visibility', async () => {
    await renderResetPasswordForm('some-valid-token');

    await user.click(
      screen.getByRole('button', { name: /mostrar las contraseñas/i }),
    );

    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getByLabelText(/confirmar contraseña/i)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});

// ─── LogoutButton ─────────────────────────────────────────────────────────────

describe('LogoutButton', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderLogoutButton() {
    const { LogoutButton } = await import('@/app/account/_components/LogoutButton');
    return render(React.createElement(LogoutButton));
  }

  it('calls /api/auth/logout and then router.replace("/") + router.refresh()', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderLogoutButton();
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still calls router.replace("/") + router.refresh() even if fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await renderLogoutButton();
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
  });
});

// ─── LogoutAllButton ──────────────────────────────────────────────────────────

describe('LogoutAllButton', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderLogoutAllButton() {
    const { LogoutAllButton } = await import('@/components/logout-all-button');
    return render(React.createElement(LogoutAllButton));
  }

  it('calls /api/auth/logout-all and router.replace("/") + router.refresh() on confirm', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderLogoutAllButton();
    await user.click(screen.getByRole('button', { name: /cerrar sesión en todos/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout-all', { method: 'POST' });
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockRefresh).toHaveBeenCalledOnce();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does nothing if user cancels the confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    await renderLogoutAllButton();
    await user.click(screen.getByRole('button', { name: /cerrar sesión en todos/i }));

    expect(fetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('redirects to "/" (not /login) on logout-all', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderLogoutAllButton();
    await user.click(screen.getByRole('button', { name: /cerrar sesión en todos/i }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockReplace).not.toHaveBeenCalledWith('/login');
    });
  });
});

// ─── Header ─────────────────────────────────────────────────────────────────

// Mock next/headers for server component tests.
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: () => undefined,
  }),
}));

describe('Header', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders "Mi cuenta" link when user is authenticated', async () => {
    vi.doMock('@/lib/auth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth')>();
      return {
        ...actual,
        getCurrentUser: vi.fn().mockResolvedValue({
          id: 'u1', email: 'joan@example.com', firstName: 'Joan', lastName: 'Costa',
        }),
      };
    });
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
    }));

    const { Header } = await import('@/components/header');
    const element = await Header();
    render(element as React.ReactElement);

    expect(screen.getByRole('link', { name: /mi cuenta/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /iniciar sesión/i })).not.toBeInTheDocument();
  });

  it('renders "Iniciar sesión" link when user is not authenticated', async () => {
    vi.doMock('@/lib/auth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth')>();
      return {
        ...actual,
        getCurrentUser: vi.fn().mockResolvedValue(null),
      };
    });
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
    }));

    const { Header } = await import('@/components/header');
    const element = await Header();
    render(element as React.ReactElement);

    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /mi cuenta/i })).not.toBeInTheDocument();
  });
});

// ─── Account page ────────────────────────────────────────────────────────────

describe('AccountPage', () => {
  afterEach(() => {
    vi.resetModules();
    mockRedirect.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
  });

  it('/account page redirects to /login when getCurrentUser returns null (session expired/revoked)', async () => {
    // Mock the auth module so getCurrentUser returns null
    vi.doMock('@/lib/auth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth')>();
      return {
        ...actual,
        getCurrentUser: vi.fn().mockResolvedValue(null),
      };
    });

    // Mock next/headers to return a dummy cookie store
    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
    }));

    // redirect() in Next.js throws internally; our mock just records the call.
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT'); });

    const { default: AccountPage } = await import('@/app/account/page');

    await expect(AccountPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/account');
  });

  it('LogoutAllButton renders in account page (button text present)', async () => {
    const user = { id: 'uuid-test', email: 'test@example.com', firstName: 'Test', lastName: 'User' };

    vi.doMock('@/lib/auth', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/auth')>();
      return {
        ...actual,
        getCurrentUser: vi.fn().mockResolvedValue(user),
      };
    });

    vi.doMock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
    }));

    // redirect should not be called when user is present
    mockRedirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT'); });

    const { default: AccountPage } = await import('@/app/account/page');

    // AccountPage is an async server component — call it and render the result
    const element = await AccountPage();
    render(element as React.ReactElement);

    expect(
      screen.getByRole('button', { name: /cerrar sesión en todos los dispositivos/i }),
    ).toBeInTheDocument();
  });
});

// ─── VerifyEmailClient ────────────────────────────────────────────────────────

describe('VerifyEmailClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockReplace.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderVerifyEmailClient(token: string) {
    const { VerifyEmailClient } = await import(
      '@/app/verify-email/_components/VerifyEmailClient'
    );
    return render(React.createElement(VerifyEmailClient, { token }));
  }

  it('POSTs the token on mount, shows success, and strips the token from the URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderVerifyEmailClient('valid-token');

    expect(await screen.findByText('Correo verificado correctamente.')).toBeInTheDocument();

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/auth/verify-email');
    expect(options.method).toBe('POST');
    expect(String(options.body)).toContain('valid-token');

    // Token removed from the URL after processing
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/verify-email'));
  });

  it('shows the generic invalid message on a 400 and never leaks internal error text', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'El enlace de verificación no es válido o ha caducado.' }),
        { status: 400 },
      ),
    );

    await renderVerifyEmailClient('used-token');

    expect(
      await screen.findByText(/enlace de verificación no es válido/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bad request/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/verify-email'));
  });

  it('shows the invalid message and does not call fetch when no token is present', async () => {
    await renderVerifyEmailClient('');

    expect(
      await screen.findByText(/enlace de verificación no es válido/i),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the invalid message (not a service error) when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await renderVerifyEmailClient('some-token');

    expect(
      await screen.findByText(/enlace de verificación no es válido/i),
    ).toBeInTheDocument();
  });

  it('POSTs the token only once', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderVerifyEmailClient('once-token');

    expect(await screen.findByText('Correo verificado correctamente.')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the success message after the token is stripped from the URL (re-render with token="")', async () => {
    // Regression: router.replace('/verify-email') re-renders the server page with
    // empty searchParams, so the client re-renders with token=''. The result must
    // NOT flip back to the invalid-link message.
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const { VerifyEmailClient } = await import(
      '@/app/verify-email/_components/VerifyEmailClient'
    );
    const view = render(React.createElement(VerifyEmailClient, { token: 'valid-token' }));

    expect(await screen.findByText('Correo verificado correctamente.')).toBeInTheDocument();

    // Simulate the post-replace re-render with the token removed from the URL.
    view.rerender(React.createElement(VerifyEmailClient, { token: '' }));

    expect(screen.getByText('Correo verificado correctamente.')).toBeInTheDocument();
    expect(
      screen.queryByText(/enlace de verificación no es válido/i),
    ).not.toBeInTheDocument();
    // No second POST is triggered by the re-render.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the invalid message after the token is stripped from the URL (re-render with token="")', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'El enlace de verificación no es válido o ha caducado.' }),
        { status: 400 },
      ),
    );

    const { VerifyEmailClient } = await import(
      '@/app/verify-email/_components/VerifyEmailClient'
    );
    const view = render(React.createElement(VerifyEmailClient, { token: 'bad-token' }));

    expect(
      await screen.findByText(/enlace de verificación no es válido/i),
    ).toBeInTheDocument();

    view.rerender(React.createElement(VerifyEmailClient, { token: '' }));

    expect(
      screen.getByText(/enlace de verificación no es válido/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── EmailVerificationStatus ──────────────────────────────────────────────────

describe('EmailVerificationStatus', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderStatus(verified: boolean) {
    const { EmailVerificationStatus } = await import(
      '@/app/account/_components/EmailVerificationStatus'
    );
    return render(React.createElement(EmailVerificationStatus, { verified }));
  }

  it('shows "Correo verificado" and no resend button when verified', async () => {
    await renderStatus(true);

    expect(screen.getByText('Correo verificado')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reenviar correo de verificación/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the pending banner and a resend button when not verified', async () => {
    await renderStatus(false);

    expect(screen.getByText(/pendiente de verificación/i)).toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: /reenviar correo de verificación/i,
    });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('resend shows the success message returned by the BFF', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          message: 'Si tu correo está pendiente de verificación, recibirás un nuevo enlace.',
        }),
        { status: 200 },
      ),
    );

    await renderStatus(false);
    await user.click(
      screen.getByRole('button', { name: /reenviar correo de verificación/i }),
    );

    expect(
      await screen.findByText(/recibirás un nuevo enlace/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/resend-verification', {
      method: 'POST',
    });
  });

  it('resend shows an accessible error message on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 500 }),
    );

    await renderStatus(false);
    await user.click(
      screen.getByRole('button', { name: /reenviar correo de verificación/i }),
    );

    expect(await screen.findByText(/no se ha podido enviar el correo/i)).toBeInTheDocument();
  });
});

// ─── ProfileCard ──────────────────────────────────────────────────────────────

describe('ProfileCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  const BASE: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    emailVerified: boolean;
    pendingEmailChange: { newEmail: string; expiresAt: string } | null;
  } = {
    firstName: 'Joan',
    lastName: 'Costa',
    email: 'joan@example.com',
    phone: '+34612345678',
    emailVerified: true,
    pendingEmailChange: null,
  };

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockReplace.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderProfileCard(overrides: Partial<typeof BASE> = {}) {
    const { ProfileCard } = await import('@/app/account/_components/ProfileCard');
    return render(React.createElement(ProfileCard, { ...BASE, ...overrides }));
  }

  async function enterEditMode() {
    await user.click(screen.getByRole('button', { name: /editar perfil/i }));
  }

  it('starts in read mode showing values and an "Editar perfil" button', async () => {
    await renderProfileCard();

    expect(screen.getByText('Joan')).toBeInTheDocument();
    expect(screen.getByText('Costa')).toBeInTheDocument();
    expect(screen.getByText('joan@example.com')).toBeInTheDocument();
    expect(screen.getByText('+34612345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar perfil/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /guardar cambios/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "No indicado" when phone is null', async () => {
    await renderProfileCard({ phone: null });
    expect(screen.getByText('No indicado')).toBeInTheDocument();
  });

  it('"Editar perfil" activates the fields; email is not editable', async () => {
    await renderProfileCard();
    await enterEditMode();

    expect(screen.getByLabelText(/nombre/i)).toBeEnabled();
    expect(screen.getByLabelText(/apellidos/i)).toBeEnabled();
    const email = screen.getByLabelText(/email/i);
    expect(email).toBeDisabled();
    expect(email).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('"Cancelar" restores values, exits edit mode, and sends no request', async () => {
    await renderProfileCard();
    await enterEditMode();

    const firstName = screen.getByLabelText(/nombre/i);
    await user.clear(firstName);
    await user.type(firstName, 'Cambiado');

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    // Back to read mode with the original persisted value
    expect(screen.getByText('Joan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates required firstName without calling the API', async () => {
    await renderProfileCard();
    await enterEditMode();

    await user.clear(screen.getByLabelText(/nombre/i));
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates required lastName without calling the API', async () => {
    await renderProfileCard();
    await enterEditMode();

    await user.clear(screen.getByLabelText(/apellidos/i));
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('Los apellidos son obligatorios.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('validates phone format client-side without calling the API', async () => {
    await renderProfileCard({ phone: null });
    await enterEditMode();

    await user.type(screen.getByLabelText(/teléfono/i), '123456');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(
      await screen.findByText(/teléfono internacional válido/i),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves successfully: shows the exact message, updates the view, refreshes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'u1',
          email: 'joan@example.com',
          firstName: 'Anna',
          lastName: 'Puig',
          phone: '+34600111222',
          emailVerified: true,
        }),
        { status: 200 },
      ),
    );

    await renderProfileCard();
    await enterEditMode();

    const firstName = screen.getByLabelText(/nombre/i);
    await user.clear(firstName);
    await user.type(firstName, 'Anna');
    const lastName = screen.getByLabelText(/apellidos/i);
    await user.clear(lastName);
    await user.type(lastName, 'Puig');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('Perfil actualizado correctamente.')).toBeInTheDocument();
    // Read mode now shows the server's canonical values
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Puig')).toBeInTheDocument();
    expect(screen.getByText('+34600111222')).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();

    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/auth/me');
    expect(options.method).toBe('PATCH');
  });

  it('keeps typed values and shows an error when the server rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'No se ha podido actualizar el perfil. Inténtalo de nuevo.' }),
        { status: 500 },
      ),
    );

    await renderProfileCard();
    await enterEditMode();

    const firstName = screen.getByLabelText(/nombre/i);
    await user.clear(firstName);
    await user.type(firstName, 'Escrito');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText(/no se ha podido actualizar el perfil/i)).toBeInTheDocument();
    // Still in edit mode and the typed value is preserved
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Escrito');
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('blocks a double submit while a save is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }) as unknown as ReturnType<typeof fetch>,
    );

    await renderProfileCard();
    await enterEditMode();

    const saveButton = screen.getByRole('button', { name: /guardar cambios/i });
    await user.click(saveButton);

    // The button is now disabled (loading) — a second click cannot fire a 2nd request
    const loadingButton = screen.getByRole('button', { name: /guardando/i });
    expect(loadingButton).toBeDisabled();
    await user.click(loadingButton);

    resolveFetch(
      new Response(
        JSON.stringify({
          id: 'u1',
          email: 'joan@example.com',
          firstName: 'Joan',
          lastName: 'Costa',
          phone: '+34612345678',
          emailVerified: true,
        }),
        { status: 200 },
      ),
    );

    await screen.findByText('Perfil actualizado correctamente.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends null for an empty phone on submit', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'u1',
          email: 'joan@example.com',
          firstName: 'Joan',
          lastName: 'Costa',
          phone: null,
          emailVerified: true,
        }),
        { status: 200 },
      ),
    );

    await renderProfileCard({ phone: '+34612345678' });
    await enterEditMode();

    await user.clear(screen.getByLabelText(/teléfono/i));
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await screen.findByText('Perfil actualizado correctamente.');
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(String(options.body)) as { phone: unknown };
    expect(body.phone).toBeNull();
  });
});

// ─── EmailChangeSection ───────────────────────────────────────────────────────

describe('EmailChangeSection', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn());
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockPush.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderSection(
    pendingEmailChange: { newEmail: string; expiresAt: string } | null = null,
  ) {
    const { EmailChangeSection } = await import(
      '@/app/account/_components/EmailChangeSection'
    );
    return render(React.createElement(EmailChangeSection, { pendingEmailChange }));
  }

  it('starts with the form hidden behind a "Cambiar correo electrónico" button', async () => {
    await renderSection(null);
    expect(
      screen.getByRole('button', { name: /cambiar correo electrónico/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/nuevo correo/i)).not.toBeInTheDocument();
  });

  it('opens the form with new-email and current-password fields', async () => {
    await renderSection(null);
    await user.click(screen.getByRole('button', { name: /cambiar correo electrónico/i }));

    const email = screen.getByLabelText(/nuevo correo/i);
    const password = screen.getByLabelText(/contraseña actual/i);
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');
  });

  it('validates email and password client-side before calling the API', async () => {
    await renderSection(null);
    await user.click(screen.getByRole('button', { name: /cambiar correo electrónico/i }));

    await user.type(screen.getByLabelText(/nuevo correo/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /enviar enlace de confirmación/i }));

    expect(await screen.findByText(/correo electrónico válido/i)).toBeInTheDocument();
    expect(screen.getByText(/introduce tu contraseña actual/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('on success shows the confirmation message and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          message: 'Hemos enviado un enlace de confirmación a tu nueva dirección.',
        }),
        { status: 200 },
      ),
    );

    await renderSection(null);
    await user.click(screen.getByRole('button', { name: /cambiar correo electrónico/i }));
    await user.type(screen.getByLabelText(/nuevo correo/i), 'nuevo@example.com');
    await user.type(screen.getByLabelText(/contraseña actual/i), 'mypassword');
    await user.click(screen.getByRole('button', { name: /enviar enlace de confirmación/i }));

    expect(
      await screen.findByText(/hemos enviado un enlace de confirmación/i),
    ).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/email-change/request');
    expect(options.method).toBe('POST');
  });

  it('on server error keeps the form and typed values and shows the message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'La contraseña actual no es correcta.' }), { status: 400 }),
    );

    await renderSection(null);
    await user.click(screen.getByRole('button', { name: /cambiar correo electrónico/i }));
    await user.type(screen.getByLabelText(/nuevo correo/i), 'nuevo@example.com');
    await user.type(screen.getByLabelText(/contraseña actual/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /enviar enlace de confirmación/i }));

    expect(await screen.findByText(/la contraseña actual no es correcta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nuevo correo/i)).toHaveValue('nuevo@example.com');
  });

  it('blocks a double submit while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }) as unknown as ReturnType<typeof fetch>,
    );

    await renderSection(null);
    await user.click(screen.getByRole('button', { name: /cambiar correo electrónico/i }));
    await user.type(screen.getByLabelText(/nuevo correo/i), 'nuevo@example.com');
    await user.type(screen.getByLabelText(/contraseña actual/i), 'mypassword');
    await user.click(screen.getByRole('button', { name: /enviar enlace de confirmación/i }));

    const inFlight = screen.getByRole('button', { name: /enviando/i });
    expect(inFlight).toBeDisabled();
    await user.click(inFlight);

    resolveFetch(new Response(JSON.stringify({ success: true, message: 'ok' }), { status: 200 }));
    await screen.findByText('ok');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the pending change with the target email and a cancel button', async () => {
    await renderSection({
      newEmail: 'nuevo@example.com',
      expiresAt: '2026-07-03T12:00:00.000Z',
    });

    expect(screen.getByText(/cambio pendiente a:/i)).toBeInTheDocument();
    expect(screen.getByText('nuevo@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar solicitud/i })).toBeInTheDocument();
  });

  it('cancel calls DELETE and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderSection({ newEmail: 'nuevo@example.com', expiresAt: '2026-07-03T12:00:00.000Z' });
    await user.click(screen.getByRole('button', { name: /cancelar solicitud/i }));

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/email-change');
    expect(options.method).toBe('DELETE');
  });
});

// ─── ConfirmEmailChangeClient ─────────────────────────────────────────────────

describe('ConfirmEmailChangeClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockReplace.mockReset();
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function renderConfirm(token: string) {
    const { ConfirmEmailChangeClient } = await import(
      '@/app/confirm-email-change/_components/ConfirmEmailChangeClient'
    );
    return render(React.createElement(ConfirmEmailChangeClient, { token }));
  }

  it('POSTs the token and on success redirects to /login?emailChanged=1', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    await renderConfirm('valid-token');

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login?emailChanged=1'));
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/email-change/confirm');
    expect(options.method).toBe('POST');
  });

  it('on failure shows the generic message and strips the token from the URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 400 }),
    );

    await renderConfirm('used-token');

    expect(
      await screen.findByText(/enlace de cambio de correo no es válido/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bad request/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unauthorized/i)).not.toBeInTheDocument();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/confirm-email-change'));
  });

  it('shows the generic message and does not fetch when no token is present', async () => {
    await renderConfirm('');
    expect(
      await screen.findByText(/enlace de cambio de correo no es válido/i),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('re-render with token="" after failure does not re-run or overwrite the result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 400 }),
    );

    const { ConfirmEmailChangeClient } = await import(
      '@/app/confirm-email-change/_components/ConfirmEmailChangeClient'
    );
    const view = render(React.createElement(ConfirmEmailChangeClient, { token: 'used-token' }));

    expect(
      await screen.findByText(/enlace de cambio de correo no es válido/i),
    ).toBeInTheDocument();

    view.rerender(React.createElement(ConfirmEmailChangeClient, { token: '' }));

    expect(
      screen.getByText(/enlace de cambio de correo no es válido/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── LoginForm email-changed banner ───────────────────────────────────────────

describe('LoginForm email-changed banner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('shows the email-changed message when emailChangedSuccess is set', async () => {
    const { LoginForm } = await import('@/app/login/_components/LoginForm');
    render(React.createElement(LoginForm, { next: null, emailChangedSuccess: true }));

    expect(
      screen.getByText(/correo actualizado correctamente\. inicia sesión con tu nueva dirección/i),
    ).toBeInTheDocument();
  });

  it('does not show the banner by default', async () => {
    const { LoginForm } = await import('@/app/login/_components/LoginForm');
    render(React.createElement(LoginForm, { next: null }));

    expect(screen.queryByText(/correo actualizado correctamente/i)).not.toBeInTheDocument();
  });
});
