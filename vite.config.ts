import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3006,
      host: '0.0.0.0',
      allowedHosts: ['fpv.r3belmind.dev', 'localhost'],
      proxy: {
        // Proxy Jamendo API to avoid CORS/Origin issues
        '/api/jamendo': {
          target: 'https://api.jamendo.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jamendo/, ''),
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
