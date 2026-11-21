import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Refuse to make a production build without real Firebase config,
  // so a broken site never gets deployed to hosting.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = REQUIRED_ENV.filter((k) => !env[k] || env[k].startsWith('your-'))
    if (missing.length) {
      throw new Error(
        `\n\nMissing Firebase config for production build: ${missing.join(', ')}\n` +
          'Fill them in .env (local) or as CI secrets, then build again.\n',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: {
          // Split big vendor libs into their own long-cached files.
          codeSplitting: {
            groups: [
              { name: 'firebase', test: /node_modules[\\/]@?firebase/ },
              { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
      // Firebase Auth + Firestore alone is ~550 kB minified; that's expected.
      chunkSizeWarningLimit: 700,
    },
  }
})
