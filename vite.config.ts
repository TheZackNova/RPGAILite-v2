import path from 'path';
import { defineConfig, loadEnv } from 'vite';
/// <reference types="vitest" />

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
        css: true,
      }
    };
});
