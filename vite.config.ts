import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { yandexStreamPlugin } from './vite-plugin-yandex-stream.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), yandexStreamPlugin()],
  server: {
    proxy: {
      // JSON API Яндекс Музыки (обход CORS на локалке)
      '/ym-api': {
        target: 'https://api.music.yandex.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ym-api/, ''),
        headers: {
          'X-Yandex-Music-Client': 'YandexMusicDesktop/24023621',
          Accept: 'application/json',
        },
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
