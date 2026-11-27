import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    modulePreload: false,
    assetsInlineLimit: 100000,
    rollupOptions: {
      output: {
        format: 'iife',
        codeSplitting: false,
      },
    },
  },
});
