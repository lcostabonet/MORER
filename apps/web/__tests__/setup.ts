// Global test setup for @morer/web
//
// Sets default environment variables required by auth.ts so that imports
// do not throw in test context.
process.env.API_URL = 'http://localhost:4000';
// NODE_ENV is read-only in TypeScript types but Vitest sets it to "test"
// automatically; no assignment needed.

// Import @testing-library/jest-dom to extend vitest expect with DOM matchers
// such as toBeInTheDocument, toHaveAttribute, toBeDisabled, etc.
import '@testing-library/jest-dom';
