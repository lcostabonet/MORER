// Phase 11J (R2) — proxy-aware client IP for rate limiting.
//
// Behind Railway's edge proxy (and, for some routes, the Next BFF), the socket peer
// is the proxy, not the client. Express resolves the real client into req.ip / req.ips
// ONLY when `trust proxy` is configured to the correct number of hops. We do NOT trust
// arbitrary X-Forwarded-For: trust is OFF by default (TRUST_PROXY unset) so a spoofed
// header on an untrusted route can never move a caller into another IP's throttle
// bucket — it simply falls back to the socket address.

// Parses the TRUST_PROXY env into an Express `trust proxy` setting.
//   unset / "false" / "0" → false  (do NOT trust XFF — safe default, coarse throttle)
//   "true"                → true   (trust all — use ONLY if the API is unreachable except via a trusted proxy)
//   a number "n"          → n      (trust exactly n proxy hops — the recommended prod value, e.g. 1 for Railway edge)
//   a token/list          → passed through (e.g. "loopback", "10.0.0.0/8")
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === '') return false;
  const v = raw.trim();
  if (v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

// The request shape we read — Express populates `ips` (client-most first) and `ip`
// from X-Forwarded-For according to the `trust proxy` setting. When trust proxy is
// off, `ips` is empty and `ip` is the socket address.
interface IpRequest {
  ips?: string[];
  ip?: string;
  socket?: { remoteAddress?: string };
}

// Normalizes IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4) so the same client keys to
// one bucket regardless of transport.
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return 'unknown';
  const trimmed = ip.trim();
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return m ? m[1] : trimmed;
}

// The throttle key: the Express-resolved client IP (which already applied the trusted
// hop count), falling back to the socket address. Never reads the raw XFF header
// itself, so it cannot be spoofed on an untrusted route.
export function clientIp(req: IpRequest): string {
  const resolved =
    (Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : undefined) ??
    req.ip ??
    req.socket?.remoteAddress;
  return normalizeIp(resolved);
}
