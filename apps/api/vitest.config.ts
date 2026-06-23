import { defineConfig } from 'vitest/config';

// Vitest configuration for @morer/api.
//
// - `node` environment: these are backend unit tests for NestJS services and
//   guards. No DOM is needed.
// - No real external services: every test mocks PrismaService and any other
//   dependency. There is NO connection to PostgreSQL, Redis, Stripe, etc.
// - Decorators: apps/api/tsconfig.json enables experimentalDecorators, which
//   Vite/esbuild honours. We never rely on emitDecoratorMetadata because tests
//   construct services and guards directly (no Nest DI container), so esbuild's
//   lack of metadata emission is irrelevant here.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Run each spec file in isolation so module-level state (e.g. fake timers)
    // never leaks between files. Helps catch state-dependent tests.
    isolate: true,
    coverage: {
      // v8 ships with vitest — no extra dependency required.
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/index.ts', 'src/main.ts', 'src/**/*.module.ts'],
    },
  },
});
