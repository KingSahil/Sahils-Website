import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0',
    open: true,
    // Aggressive no-cache headers for development
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': 'no-cache'
    },
    // Force reload on file changes
    hmr: {
      overlay: true
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Remove all caching for production builds too
    rollupOptions: {
      output: {
        // No hash, add timestamp for cache busting
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  // Disable caching in preview mode with aggressive headers
  preview: {
    port: 3001,
    host: '0.0.0.0',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': 'no-cache'
    }
  }
})
