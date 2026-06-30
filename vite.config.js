import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        showcase: resolve(__dirname, 'showcase.html'),
        headwear: resolve(__dirname, 'headwear.html'),
        outerwear: resolve(__dirname, 'outerwear.html'),
      },
    },
  },
});
