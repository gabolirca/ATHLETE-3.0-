import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['db/**/*.test.ts'],
    // Comparten una base: archivos en serie para que las pruebas sean deterministas.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
