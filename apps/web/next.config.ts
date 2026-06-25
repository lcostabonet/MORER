import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self' https://api.stripe.com https://hooks.stripe.com",
  "frame-src https://js.stripe.com",
  "worker-src 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // same-origin-allow-popups: required for Stripe 3D Secure popup windows.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // Report-Only CSP — no enforcement yet. Verify in DevTools before switching to enforcement.
  { key: 'Content-Security-Policy-Report-Only', value: cspDirectives },
];

const prodHeaders = isProd && (process.env.WEB_ORIGIN ?? '').startsWith('https://')
  ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
  : [];

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      { source: '/(.*)', headers: [...baseHeaders, ...prodHeaders] },
    ];
  },
};

export default nextConfig;
