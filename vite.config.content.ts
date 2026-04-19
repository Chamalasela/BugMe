import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/content/recorder.ts'),
      output: {
        format: 'iife',
        name: 'BugMeRecorder',
        entryFileNames: 'content-recorder.js',
        inlineDynamicImports: true,
      },
    },
  },
});
