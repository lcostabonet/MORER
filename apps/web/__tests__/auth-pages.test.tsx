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
