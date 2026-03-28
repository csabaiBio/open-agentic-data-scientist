import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { warmBackend } from './api'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ProjectDetail from './pages/ProjectDetail'

export default function App() {
  useEffect(() => {
    type IdleCallbackHandle = number
    type IdleCallback = () => void

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleCallback, options?: { timeout: number }) => IdleCallbackHandle
      cancelIdleCallback?: (handle: IdleCallbackHandle) => void
    }

    const runWarmup = () => {
      void warmBackend().catch(() => {
        // Ignore warmup failures; first real request will still load modules lazily.
      })
    }

    const handle = typeof idleWindow.requestIdleCallback === 'function'
      ? idleWindow.requestIdleCallback(runWarmup, { timeout: 2000 })
      : window.setTimeout(runWarmup, 1200)

    return () => {
      if (typeof idleWindow.cancelIdleCallback === 'function' && typeof idleWindow.requestIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(handle)
        return
      }
      window.clearTimeout(handle)
    }
  }, [])

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/project/:id" element={<ProjectDetail />} />
      </Route>
    </Routes>
  )
}
