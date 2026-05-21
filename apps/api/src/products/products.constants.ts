export const DEFAULT_CURRENCY = 'EUR';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
// Clamp page to avoid arbitrarily large skip values.
export const MAX_PAGE = 1000;

// Valid slug: lowercase letters, digits, separated by single hyphens.
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
