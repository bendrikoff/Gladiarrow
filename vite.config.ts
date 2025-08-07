import { defineConfig } from "vite"
import path from "path"

export default defineConfig({
  server: {
    host: true,
    open: true,
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: ["phaser"],
      output: {
        globals: {
          phaser: "Phaser",
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  publicDir: "public",
  optimizeDeps: {
    exclude: ["phaser"],
  },
})
