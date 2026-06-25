import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vitest configuration for @morer/web.
//
// - `jsdom` environment: required for React component tests with
//   @testing-library/react. Route handler tests also run in jsdom because
//   they import Next.js code that references browser-like globals.
// - Path alias "@/*" maps to "./src/*" matching apps/web/tsconfig.json.
// - `server-only` is stubbed out so the import does not throw in tests
//   (it would throw because Vitest is not the Next.js server runtime).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    isolate: true,
    setupFiles: ['__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub "server-only" so it doesn't throw when imported in test context.
      'server-only': path.resolve(__dirname, '__tests__/__mocks__/server-only.ts'),
    },
  },
});
