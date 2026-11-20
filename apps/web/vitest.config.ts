import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const preloadFetch = fileURLToPath(new URL('./test/preload-fetch.cjs', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--require', preloadFetch] } },
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
  },
});
