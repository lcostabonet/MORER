// Centralized, pure, testable phone normalization for customer profiles.
//
// Rules (see Phase 11C-alpha spec):
//   1. trim;
//   2. empty -> null (phone is optional);
//   3. require a leading '+';
//   4. strip spaces, dashes and parentheses (common visual separators);
//   5. store as '+' followed only by digits;
//   6. require 8–15 digits after the '+';
//   7. reject letters, extensions and otherwise ambiguous input.
//
// Returns a discriminated result rather than throwing, so callers can map an
// invalid value to a controlled 400 and a null/valid value to persistence.
// Invalid input is NEVER silently coerced to null.

export type PhoneNormalizationResult =
  | { ok: true; value: string | null }
  | { ok: false };

const SEPARATORS = /[\s\-()]/g;
const NORMALIZED = /^\d{8,15}$/;

export function normalizePhone(
  input: string | null | undefined,
): PhoneNormalizationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== 'string') {
    return { ok: false };
  }

  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, value: null };
  }

  if (!trimmed.startsWith('+')) {
    return { ok: false };
  }

  // Everything after the '+', with visual separators removed.
  const digits = trimmed.slice(1).replace(SEPARATORS, '');

  if (!NORMALIZED.test(digits)) {
    return { ok: false };
  }

  return { ok: true, value: '+' + digits };
}
