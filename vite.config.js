import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  root: '.',
  base: './', // 相对路径，便于直接用 file:// 或子路径访问
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: true, // CSS 按 chunk 拆分
    minify: 'esbuild', // esbuild 压缩（速度最快）
    rollupOptions: {
      output: {
        // 手动分包：把 Vue 单独拆出来（长期缓存友好）
        manualChunks: {
          vue: ['vue', 'vue-router'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    // 开发时 Vite 跑在 3000，这是用户唯一需要访问的端口（同源，零 CORS）
    port: Number(process.env.VITE_PORT) || 3000,
    strictPort: true,
    proxy: {
      // 把后端 API 代理到内部 Express（默认 3001）
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});
