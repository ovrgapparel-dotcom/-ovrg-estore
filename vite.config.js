import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        showcase: resolve(__dirname, 'showcase.html'),
        headwear: resolve(__dirname, 'headwear.html'),
        jeans: resolve(__dirname, 'jeans.html'),
        hoodies: resolve(__dirname, 'hoodies.html'),
      },
    },
  },
  test: {
    setupFiles: ['./testSetup.js'],
  }
});
