import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeRootPath(value?: string): string {
  if (!value || value === '/') {
    return '/'
  }

  return `/${value.replace(/^\/+|\/+$/g, '')}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rootPath = normalizeRootPath(env.VITE_FRONTEND_URL_PREFIX)
  const frontendHost = env.VITE_HOST_IP || '0.0.0.0'
  const frontendPort = Number.parseInt(env.VITE_FRONTEND_PORT || '5173', 10)
  const backendPort = Number.parseInt(env.VITE_BACKEND_PORT || '8765', 10)
  const apiPrefix = rootPath === '/' ? '/api' : `${rootPath}api`

  return {
    base: rootPath,
    plugins: [react()],
    server: {
      host: frontendHost,
      port: frontendPort,
      allowedHosts: ['*'],
      proxy: {
        [apiPrefix]: {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
          rewrite: (path) => (
            rootPath === '/'
              ? path
              : `/api${path.slice(apiPrefix.length)}`
          ),
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  }
})
