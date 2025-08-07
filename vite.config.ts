import { defineConfig } from 'vite'
import path from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'public/assets/*', // 👈 без dist/, копируем содержимое public/assets
          dest: 'assets'          // 👈 попадёт в dist/assets
        }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})
