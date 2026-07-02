import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/auth/phone.util';

// ─── Phase 11C-alpha: phone normalization (pure function) ─────────────────────

describe('normalizePhone', () => {
  it('returns null for null/undefined (phone is optional)', () => {
    expect(normalizePhone(null)).toEqual({ ok: true, value: null });
    expect(normalizePhone(undefined)).toEqual({ ok: true, value: null });
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(normalizePhone('')).toEqual({ ok: true, value: null });
    expect(normalizePhone('   ')).toEqual({ ok: true, value: null });
  });

  it('normalizes a spaced Spanish number', () => {
    expect(normalizePhone('+34 612 345 678')).toEqual({
      ok: true,
      value: '+34612345678',
    });
  });

  it('normalizes a dashed US number', () => {
    expect(normalizePhone('+1-202-555-0147')).toEqual({
      ok: true,
      value: '+12025550147',
    });
  });

  it('strips parentheses and spaces from a UK number', () => {
    const result = normalizePhone('+44 (0)20 1234 5678');
    expect(result.ok).toBe(true);
    // '+' then digits only, separators/parentheses removed
    expect(result).toEqual({ ok: true, value: '+4402012345678' });
  });

  it('accepts the minimum (8 digits) and maximum (15 digits) lengths', () => {
    expect(normalizePhone('+12345678')).toEqual({ ok: true, value: '+12345678' });
    expect(normalizePhone('+123456789012345')).toEqual({
      ok: true,
      value: '+123456789012345',
    });
  });

  it('rejects a number without a leading +', () => {
    expect(normalizePhone('34612345678')).toEqual({ ok: false });
  });

  it('rejects a number containing letters', () => {
    expect(normalizePhone('+34 ABC 345 678')).toEqual({ ok: false });
  });

  it('rejects a number with an extension', () => {
    expect(normalizePhone('+34612345678 ext 5')).toEqual({ ok: false });
  });

  it('rejects too few digits (<8)', () => {
    expect(normalizePhone('+1234567')).toEqual({ ok: false });
  });

  it('rejects too many digits (>15)', () => {
    expect(normalizePhone('+1234567890123456')).toEqual({ ok: false });
  });

  it('rejects a lone + with no digits', () => {
    expect(normalizePhone('+')).toEqual({ ok: false });
  });

  it('rejects a non-string value', () => {
    // Defensive: callers may pass through unexpected JSON types.
    expect(normalizePhone(42 as unknown as string)).toEqual({ ok: false });
  });

  it('never silently coerces an invalid value to null', () => {
    // A non-empty but invalid value must be rejected, not treated as "cleared".
    const result = normalizePhone('not-a-phone');
    expect(result.ok).toBe(false);
  });
});
