import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  css: {
    postcss: { plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') }), autoprefixer()] },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${process.env.PORT || 4000}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  test: {
    root: '.',
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    globalSetup: ['tests/helpers/globalSetup.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: ['default', 'json'],
    outputFile: { json: 'docs/test-results/vitest-results.json' },
    env: { BCRYPT_ROUNDS: '4' },
    coverage: { provider: 'v8', include: ['server/**/*.js'], reporter: ['text-summary', 'json-summary'], reportsDirectory: 'docs/test-results/coverage' },
  },
});
