// Deux pages : la PWA de croquis (index.html) et la visionneuse des projets partagés (view.html, servie à /view).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        view: fileURLToPath(new URL('./view.html', import.meta.url)),
      },
    },
  },
});
