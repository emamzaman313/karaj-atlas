import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0' },
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: { target: 'es2022', sourcemap: true }
});
