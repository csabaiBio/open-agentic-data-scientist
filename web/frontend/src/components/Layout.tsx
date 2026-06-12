import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { FlaskConical, LayoutDashboard, Moon, Sun } from 'lucide-react'

const THEME_STORAGE_KEY = 'oads-theme'

const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function Layout() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getInitialTheme())
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 via-gray-50 to-gray-100 dark:from-[#121212] dark:via-[#121212] dark:to-[#161d25] transition-colors duration-200">
      {/* Top nav */}
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-[#121212]/80 backdrop-blur-lg border-b border-gray-200/60 dark:border-[#3d444b]/70 transition-colors duration-200">
        <div className="w-full px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-sm">
              <FlaskConical className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-gray-900 dark:text-white">
              AI Data Scientist
            </span>
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-[#53585f] bg-white/90 dark:bg-[#293037] text-gray-700 dark:text-[#f0f0f0] hover:bg-gray-100 dark:hover:bg-[#3d444b] transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="text-xs font-medium">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isHome
                  ? 'bg-brand-50 dark:bg-[#0590f2]/20 text-brand-700 dark:text-[#54a8f7]'
                  : 'text-gray-500 dark:text-[#80858a] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#293037]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Projects
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="w-full px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
