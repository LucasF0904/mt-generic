import { coverageConfigDefaults, defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    // IMPORTANT: Keep this alias map in sync with tsconfig.json's compilerOptions.paths.
    // This is the Vite equivalent of vite-tsconfig-paths (which is ESM-only and incompatible with
    // vitest's CJS Node API). The paths in tsconfig.json are the source of truth; any new library
    // or path alias must be added to both places.
    alias: {
      '@mt/domain': '/libs/domain/src/index.ts',
      '@mt/platform': '/libs/platform/src/index.ts',
      '@mt/storage': '/libs/storage/src/index.ts',
      '@mt/setup': '/libs/setup/src/index.ts',
      '@mt/obs': '/libs/obs/src/index.ts',
      '@mt/profiles': '/libs/profiles/src/index.ts',
      '@mt/recording': '/libs/recording/src/index.ts',
      '@mt/transcription': '/libs/transcription/src/index.ts',
      '@mt/synthesis': '/libs/synthesis/src/index.ts',
      '@mt/routing': '/libs/routing/src/index.ts',
      '@mt/processing': '/libs/processing/src/index.ts',
      '@mt/frame-analysis': '/libs/frame-analysis/src/index.ts',
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['{apps,libs}/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Bootstrap/wiring files with no meaningful logic to unit test: main.ts is a thin
        // CommandFactory.run() entrypoint (see the errorHandler note there) and cli.module.ts
        // is pure declarative @Module DI wiring. Both are covered by manual verification instead.
        'apps/cli/src/main.ts',
        'apps/cli/src/cli.module.ts',
        // Declarative DI wiring: a single useFactory that delegates to detectPlatform()
        // (itself unit-tested in platform.spec.ts). Same rationale as cli.module.ts above.
        'libs/platform/src/platform.module.ts',
      ],
      // Per-layer coverage targets from the plan/spec (§3, §14): domain 90%+, other libs 80%+,
      // apps 60%+. Vitest/the v8 provider resolves each glob into its own threshold group, so
      // this mirrors the test pyramid's layers directly instead of falling back to one number.
      thresholds: {
        'libs/domain/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'libs/platform/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/storage/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/setup/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/obs/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/profiles/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/recording/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/transcription/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/synthesis/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/routing/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/processing/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'libs/frame-analysis/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'apps/**': { statements: 60, branches: 60, functions: 60, lines: 60 },
      },
    },
  },
});
