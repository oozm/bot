import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  publicDir: false,
  plugins: [
    vue(),
    dts({
      entryRoot: 'src',
      outDir: 'lib',
      include: ['src/lib.ts', 'src/components/**/*.vue', 'src/bot/**/*.ts', 'src/ui/gaze.ts'],
      rollupTypes: true,
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/lib.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'xbot',
    },
    outDir: 'lib',
    emptyOutDir: true,
    rollupOptions: {
      external: ['vue'],
    },
  },
})
