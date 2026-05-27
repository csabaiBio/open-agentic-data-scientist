import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Clock, FileStack, Trash2, Loader2, Upload, X, Sparkles, Compass, Settings2, ChevronDown, ChevronUp, Coins } from 'lucide-react'
import {
  fetchProjects,
  createProject,
  createLlmModel,
  deleteLlmModel,
  deleteProject,
  fetchLlmModels,
} from '../api'
import type { LlmModel, LlmModelType, ProjectSummary, ProjectMode } from '../types'
import StatusBadge from '../components/StatusBadge'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(secs: number | null): string {
  if (secs === null) return '-'
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function formatUsd(value: number | null | undefined): string {
  const amount = typeof value === 'number' ? value : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount < 0.01 ? 4 : 2,
    maximumFractionDigits: amount < 0.01 ? 4 : 2,
  }).format(amount)
}

type DashboardConfigPayload = {
  query: string
  mode: ProjectMode
  human_in_the_loop: boolean
  num_papers: number
  days_back: number
  max_cost_usd: number | null
  base_project_id: string
  planning_llm_model_id: number | null
  review_llm_model_id: number | null
  coding_llm_model_id: number | null
}

const DASHBOARD_CONFIG_STORAGE_KEY = 'agenticds.dashboard.config.v1'

function toYamlScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function dashboardConfigToYaml(config: DashboardConfigPayload): string {
  const lines = [
    '# Agentic Data Scientist Dashboard Config',
    '# Note: uploaded files are not included in this config.',
  ]

  for (const [key, value] of Object.entries(config)) {
    lines.push(`${key}: ${toYamlScalar(value as string | number | boolean | null)}`)
  }

  return `${lines.join('\n')}\n`
}

function parseYamlScalar(raw: string): string | number | boolean | null {
  const value = raw.trim()
  if (value === '' || value === 'null') return null
  if (value === 'true') return true
  if (value === 'false') return false
  if (value.startsWith('"') || value.startsWith("'")) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return value
}

function parseDashboardYaml(yaml: string): Partial<DashboardConfigPayload> {
  const parsed: Record<string, string | number | boolean | null> = {}
  const lines = yaml.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    const rawValue = trimmed.slice(idx + 1)
    parsed[key] = parseYamlScalar(rawValue)
  }

  return parsed as Partial<DashboardConfigPayload>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const configUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ProjectMode>('orchestrated')
  const [humanInTheLoop, setHumanInTheLoop] = useState(true)
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [numPapers, setNumPapers] = useState(10)
  const [daysBack, setDaysBack] = useState(30)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [llmModels, setLlmModels] = useState<LlmModel[]>([])
  const [llmModelsLoading, setLlmModelsLoading] = useState(false)
  const [planningLlmModelId, setPlanningLlmModelId] = useState<number | ''>('')
  const [reviewLlmModelId, setReviewLlmModelId] = useState<number | ''>('')
  const [codingLlmModelId, setCodingLlmModelId] = useState<number | ''>('')
  const [newLlmType, setNewLlmType] = useState<LlmModelType>('openai')
  const [newLlmModelName, setNewLlmModelName] = useState('')
  const [newLlmProviderUrl, setNewLlmProviderUrl] = useState('')
  const [newLlmApiKey, setNewLlmApiKey] = useState('')
  const [creatingLlmModel, setCreatingLlmModel] = useState(false)
  const [modelSettingsNeedsAttention, setModelSettingsNeedsAttention] = useState(false)
  const [planningModel, setPlanningModel] = useState('')
  const [reviewModel, setReviewModel] = useState('')
  const [codingModel, setCodingModel] = useState('')
  const [maxCostUsd, setMaxCostUsd] = useState<number | ''>('')
  const [baseProjectId, setBaseProjectId] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [nowMs, setNowMs] = useState(Date.now())
  const yearsBack = Math.max(1, Math.round(daysBack / 365))

  const load = useCallback(async () => {
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch (e) {
      console.error('Failed to load projects:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLlmModelRegistry = useCallback(async () => {
    setLlmModelsLoading(true)
    try {
      const data = await fetchLlmModels()
      setLlmModels(data)
    } catch (e) {
      console.error('Failed to load LLM models:', e)
    } finally {
      setLlmModelsLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadLlmModelRegistry() }, [loadLlmModelRegistry])

  useEffect(() => {
    const hasRunning = projects.some(p => p.status === 'running' || p.status === 'pending')
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [projects, load])

  useEffect(() => {
    const hasRunning = projects.some(p => p.status === 'running' || p.status === 'pending')
    if (!hasRunning) return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [projects])

  const getElapsedSeconds = (project: ProjectSummary): number | null => {
    if (project.status === 'running' || project.status === 'pending') {
      if (typeof project.duration === 'number' && project.duration >= 0) return project.duration
      const createdMs = new Date(project.created_at).getTime()
      if (!Number.isFinite(createdMs)) return null
      return Math.max(0, (nowMs - createdMs) / 1000)
    }
    return typeof project.duration === 'number' ? project.duration : null
  }

  const applySelectedModelToRole = useCallback((role: 'planning' | 'review' | 'coding', modelId: number | '') => {
    setModelSettingsNeedsAttention(false)
    if (role === 'planning') {
      setPlanningLlmModelId(modelId)
      setPlanningModel(typeof modelId === 'number' ? (llmModels.find(m => m.id === modelId)?.model_name ?? '') : '')
    }
    if (role === 'review') {
      setReviewLlmModelId(modelId)
      setReviewModel(typeof modelId === 'number' ? (llmModels.find(m => m.id === modelId)?.model_name ?? '') : '')
    }
    if (role === 'coding') {
      setCodingLlmModelId(modelId)
      setCodingModel(typeof modelId === 'number' ? (llmModels.find(m => m.id === modelId)?.model_name ?? '') : '')
    }
  }, [llmModels])

  const handleCreateLlmModel = async () => {
    const modelName = newLlmModelName.trim()
    const providerUrl = newLlmProviderUrl.trim()
    const apiKey = newLlmApiKey.trim()
    if (!modelName || !providerUrl) return

    setCreatingLlmModel(true)
    setModelSettingsNeedsAttention(false)
    try {
      const created = await createLlmModel({
        type: newLlmType,
        model_name: modelName,
        provider_url: providerUrl,
        ...(apiKey ? { api_key: apiKey } : {}),
      })
      setLlmModels(prev => [...prev, created].sort((a, b) => `${a.type}:${a.model_name}`.localeCompare(`${b.type}:${b.model_name}`)))
      setNewLlmModelName('')
      setNewLlmProviderUrl('')
      setNewLlmApiKey('')
    } catch (e) {
      console.error('Failed to create LLM model:', e)
      alert('Failed to add LLM model')
    } finally {
      setCreatingLlmModel(false)
    }
  }

  const handleDeleteLlmModel = async (modelId: number) => {
    try {
      await deleteLlmModel(modelId)
      setLlmModels(prev => prev.filter(m => m.id !== modelId))
      if (planningLlmModelId === modelId) setPlanningLlmModelId('')
      if (reviewLlmModelId === modelId) setReviewLlmModelId('')
      if (codingLlmModelId === modelId) setCodingLlmModelId('')
    } catch (e) {
      console.error('Failed to delete LLM model:', e)
      alert('Failed to delete LLM model')
    }
  }

  const getCurrentDashboardConfig = useCallback((): DashboardConfigPayload => ({
    query,
    mode,
    human_in_the_loop: humanInTheLoop,
    num_papers: numPapers,
    days_back: daysBack,
    max_cost_usd: typeof maxCostUsd === 'number' ? maxCostUsd : null,
    base_project_id: baseProjectId,
    planning_llm_model_id: typeof planningLlmModelId === 'number' ? planningLlmModelId : null,
    review_llm_model_id: typeof reviewLlmModelId === 'number' ? reviewLlmModelId : null,
    coding_llm_model_id: typeof codingLlmModelId === 'number' ? codingLlmModelId : null,
  }), [
    query, mode, humanInTheLoop, numPapers, daysBack, maxCostUsd, baseProjectId,
    planningLlmModelId, reviewLlmModelId, codingLlmModelId,
  ])

  const applyDashboardConfig = useCallback((config: Partial<DashboardConfigPayload>) => {
    if (typeof config.query === 'string') setQuery(config.query)
    if (config.mode === 'orchestrated' || config.mode === 'simple' || config.mode === 'discovery') setMode(config.mode)
    if (typeof config.human_in_the_loop === 'boolean') setHumanInTheLoop(config.human_in_the_loop)
    if (typeof config.num_papers === 'number' && Number.isFinite(config.num_papers)) {
      setNumPapers(Math.max(1, Math.min(20, Math.round(config.num_papers))))
    }
    if (typeof config.days_back === 'number' && Number.isFinite(config.days_back)) {
      setDaysBack(Math.max(1, Math.min(180, Math.round(config.days_back))))
    }
    if (typeof config.max_cost_usd === 'number' && Number.isFinite(config.max_cost_usd)) {
      setMaxCostUsd(Math.max(0, config.max_cost_usd))
    } else if (config.max_cost_usd === null) {
      setMaxCostUsd(2.00)
    }
    if (typeof config.base_project_id === 'string') setBaseProjectId(config.base_project_id)
    if (typeof config.planning_llm_model_id === 'number' && Number.isFinite(config.planning_llm_model_id)) setPlanningLlmModelId(config.planning_llm_model_id)
    if (typeof config.review_llm_model_id === 'number' && Number.isFinite(config.review_llm_model_id)) setReviewLlmModelId(config.review_llm_model_id)
    if (typeof config.coding_llm_model_id === 'number' && Number.isFinite(config.coding_llm_model_id)) setCodingLlmModelId(config.coding_llm_model_id)
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_CONFIG_STORAGE_KEY)
      if (!raw) return
      const config = JSON.parse(raw) as Partial<DashboardConfigPayload>
      applyDashboardConfig(config)
    } catch (e) {
      console.error('Failed to restore dashboard config:', e)
    }
  }, [applyDashboardConfig])


  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_CONFIG_STORAGE_KEY, JSON.stringify(getCurrentDashboardConfig()))
    } catch (e) {
      console.error('Failed to persist dashboard config:', e)
    }
  }, [getCurrentDashboardConfig])

  useEffect(() => {
    if (llmModels.length === 0) return
    if (typeof planningLlmModelId === 'number') {
      const found = llmModels.find(m => m.id === planningLlmModelId)
      if (found) setPlanningModel(found.model_name)
    }
    if (typeof reviewLlmModelId === 'number') {
      const found = llmModels.find(m => m.id === reviewLlmModelId)
      if (found) setReviewModel(found.model_name)
    }
    if (typeof codingLlmModelId === 'number') {
      const found = llmModels.find(m => m.id === codingLlmModelId)
      if (found) setCodingModel(found.model_name)
    }
  }, [llmModels])

  useEffect(() => {
    if (projects.length === 0) return
    if (!selectedProjectId || !projects.some(project => project.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  const handleDownloadConfigYaml = () => {
    const yaml = dashboardConfigToYaml(getCurrentDashboardConfig())
    const blob = new Blob([yaml], { type: 'application/x-yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'dashboard-config.yaml'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handleUploadConfigYaml = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseDashboardYaml(text)
      applyDashboardConfig(parsed)
      window.localStorage.setItem(
        DASHBOARD_CONFIG_STORAGE_KEY,
        JSON.stringify({ ...getCurrentDashboardConfig(), ...parsed }),
      )
    } catch (e) {
      console.error('Failed to load dashboard config:', e)
      alert('Failed to load config file. Please check YAML formatting.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCreate = async () => {
    if (!query.trim()) return
    setCreating(true)
    setModelSettingsNeedsAttention(false)
    try {
      const project = await createProject({
        query, mode, files, numPapers, daysBack,
        humanInTheLoop,
        planningLlmModelId: typeof planningLlmModelId === 'number' ? planningLlmModelId : undefined,
        reviewLlmModelId: typeof reviewLlmModelId === 'number' ? reviewLlmModelId : undefined,
        codingLlmModelId: typeof codingLlmModelId === 'number' ? codingLlmModelId : undefined,
        maxCostUsd: typeof maxCostUsd === 'number' && maxCostUsd > 0 ? maxCostUsd : undefined,
        baseProjectId: baseProjectId || undefined,
      })
      navigate(`/project/${project.id}`)
    } catch (e) {
      console.error('Failed to create project:', e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      if (/Selected\s+(planning|review|coding)\s+model\s+not\s+found/i.test(errorMessage)) {
        setShowModelSettings(true)
        setModelSettingsNeedsAttention(true)
      }
      alert(`Error: ${errorMessage}`)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this project and all its files?')) return
    try {
      await deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const activeProjects = projects.filter(p => p.status === 'running' || p.status === 'pending').length
  const completedProjects = projects.filter(p => p.status === 'completed').length
  const totalProjectCost = projects.reduce((sum, p) => sum + (typeof p.total_cost_usd === 'number' ? p.total_cost_usd : 0), 0)
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? null

  return (
    <div className="w-full max-w-none grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_340px] gap-6">
      <aside className="sticky top-0 self-start h-screen overflow-y-auto pr-1 space-y-4">
        <div className="glass-card p-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-900">New Session</h1>
            <p className="text-xs text-gray-500 mt-1">Start a new analysis or open a previous project</p>
          </div>
          <button onClick={() => setShowNew(prev => !prev)} className="flex items-center gap-2 px-3 py-2 bg-brand-600 text-white rounded-lg font-medium text-xs shadow-sm hover:bg-brand-700 transition-colors">
            {showNew ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showNew ? 'Close' : 'New'}
          </button>
        </div>

       

        {showNew && (
          <div className="glass-card p-4 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="w-5 h-5 text-brand-500" />New Analysis</h2>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Analysis Mode</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button onClick={() => setMode('orchestrated')} className={`px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${mode === 'orchestrated' ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div className="font-semibold">Orchestrated</div><div className="text-xs mt-0.5 opacity-70">Multi-agent with planning & review</div>
                </button>
                <button onClick={() => setMode('simple')} className={`px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${mode === 'simple' ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div className="font-semibold">Simple</div><div className="text-xs mt-0.5 opacity-70">Direct coding, faster & cheaper</div>
                </button>
                <button onClick={() => setMode('discovery')} className={`px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all ${mode === 'discovery' ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div className="font-semibold">Discovery</div><div className="text-xs mt-0.5 opacity-70">PubMed literature + novel hypothesis</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Input Files <span className="text-gray-400 font-normal">(optional)</span></label>
              <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 cursor-pointer transition-colors bg-gray-50/50">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">{files.length > 0 ? `${files.length} file(s) selected` : 'Click to upload files'}</span>
                <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </label>
            </div>

            {mode === 'discovery' && (
              <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-100 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700"><Compass className="w-4 h-4" />Discovery Settings</div>
                <div>
                  <div className="flex items-center justify-between mb-1"><label className="text-sm text-gray-600">Number of papers</label><span className="text-sm font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">{numPapers}</span></div>
                  <input type="range" min={1} max={20} value={numPapers} onChange={(e) => setNumPapers(Number(e.target.value))} className="w-full h-1.5 rounded-full bg-violet-200 appearance-none cursor-pointer accent-violet-600" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1"><label className="text-sm text-gray-600">Look back period</label><span className="text-sm font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">{yearsBack} year{yearsBack === 1 ? '' : 's'}</span></div>
                  <input type="range" min={1} max={30} value={yearsBack} onChange={(e) => setDaysBack(Number(e.target.value) * 365)} className="w-full h-1.5 rounded-full bg-violet-200 appearance-none cursor-pointer accent-violet-600" />
                </div>
              </div>
            )}

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setShowModelSettings(prev => !prev)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <span className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-gray-400" />Model Settings</span>
                {showModelSettings ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showModelSettings && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                  <div className={`rounded-xl border p-3.5 space-y-3 ${modelSettingsNeedsAttention ? 'border-rose-300 bg-rose-50/70' : 'border-gray-200 bg-gray-100/80'}`}>
                    <div className="text-[11px] text-gray-500">Models are stored in SQLite with type, model name, provider URL, and an optional provider API key that stays on the backend.</div>
                    <div className="rounded-lg border bg-white p-3 space-y-2">
                      <div className="text-xs font-medium text-gray-600">Add LLM Model</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                        <select value={newLlmType} onChange={(e) => { setModelSettingsNeedsAttention(false); setNewLlmType(e.target.value as LlmModelType) }} className="px-2.5 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="openai">openai</option><option value="anthropic">anthropic</option><option value="local">local</option><option value="azure-openai">azure-openai</option><option value="azure-anthropic">azure-anthropic</option></select>
                        <input value={newLlmProviderUrl} onChange={(e) => { setModelSettingsNeedsAttention(false); setNewLlmProviderUrl(e.target.value) }} placeholder="provider_url" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                        <input value={newLlmModelName} onChange={(e) => { setModelSettingsNeedsAttention(false); setNewLlmModelName(e.target.value) }} placeholder="model_name" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                        <input type="password" value={newLlmApiKey} onChange={(e) => { setModelSettingsNeedsAttention(false); setNewLlmApiKey(e.target.value) }} placeholder="provider_api_key (optional)" className="px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                      </div>
                      <button onClick={handleCreateLlmModel} disabled={creatingLlmModel || !newLlmModelName.trim() || !newLlmProviderUrl.trim()} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{creatingLlmModel ? 'Adding...' : 'Add model'}</button>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-500">Saved Models</div>
                      {llmModelsLoading ? <div className="text-xs text-gray-400">Loading models...</div> : llmModels.length === 0 ? <div className="text-xs text-gray-400">No saved models yet.</div> : llmModels.map(model => (
                        <div key={model.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-700 truncate flex items-center gap-1.5"><span>{model.type} | {model.model_name}</span>{model.has_api_key && <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">key saved{model.api_key_preview ? ` (${model.api_key_preview})` : ''}</span>}</div>
                            <div className="text-[10px] text-gray-400 truncate">{model.provider_url}</div>
                          </div>
                          <button onClick={() => handleDeleteLlmModel(model.id)} className="text-[10px] text-red-500 hover:text-red-600 px-2 py-0.5 rounded">Delete</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`rounded-xl border p-3.5 space-y-3 ${modelSettingsNeedsAttention ? 'border-rose-300 bg-rose-50/70' : 'border-gray-200 bg-gray-100/80'}`}>
                    <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Model Selection</div><span className={`text-[10px] px-2 py-0.5 rounded-full ${modelSettingsNeedsAttention ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>{modelSettingsNeedsAttention ? 'Select valid model' : 'Role Assignment'}</span></div>
                    {modelSettingsNeedsAttention && <div className="text-[11px] text-rose-700 bg-rose-100 border border-rose-200 rounded-md px-2 py-1">The selected model was not found. Add it again or choose another saved model before starting analysis.</div>}
                    <div className="space-y-2">
                      {mode !== 'simple' && <div><label className="block text-xs font-medium text-gray-500 mb-1">Planning Model</label><select value={planningLlmModelId} onChange={(e) => applySelectedModelToRole('planning', e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="">Select planning model</option>{llmModels.map(model => (<option key={model.id} value={model.id}>{model.type} | {model.model_name}</option>))}</select></div>}
                      {mode !== 'simple' && <div><label className="block text-xs font-medium text-gray-500 mb-1">Review Model</label><select value={reviewLlmModelId} onChange={(e) => applySelectedModelToRole('review', e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="">Select review model</option>{llmModels.map(model => (<option key={model.id} value={model.id}>{model.type} | {model.model_name}</option>))}</select></div>}
                      {mode !== 'discovery' && <div><label className="block text-xs font-medium text-gray-500 mb-1">Coding Model</label><select value={codingLlmModelId} onChange={(e) => applySelectedModelToRole('coding', e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"><option value="">Select coding model</option>{llmModels.map(model => (<option key={model.id} value={model.id}>{model.type} | {model.model_name}</option>))}</select><p className="text-[10px] text-gray-400 mt-1">If no saved coding model is selected, default is <span className="font-medium text-gray-500">claude-sonnet-4-5</span>.</p></div>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-100/80 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Cost Limit</div><span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Budget Guardrail</span></div>
                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Max Cost (USD) <span className="text-gray-300">(optional stop limit)</span></label><input type="number" min="0" step="0.01" value={maxCostUsd} onChange={e => { const value = e.target.value; setMaxCostUsd(value === '' ? '' : Math.max(0, Number(value))) }} placeholder="e.g. 2.50" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-brand-400 focus:ring-1 focus:ring-brand-100 outline-none" /></div>
                  </div>

                  
                </div>
              )}
            </div>
              <div className="rounded-xl border border-gray-200 bg-gray-100/80 p-3.5 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Interaction</div>
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 cursor-pointer">
                      <span className="text-sm text-gray-700">Human in the loop</span>
                      <input
                        type="checkbox"
                        checked={humanInTheLoop}
                        onChange={(e) => setHumanInTheLoop(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                      />
                    </label>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-600 font-semibold mr-1 align-middle">?</span>
                      When enabled, the agent can pause and ask clarifying questions if your request is ambiguous. You can answer in the Activity Log to continue.
                    </p>
                  </div>

          </div>
        )}
         <div className="glass-card p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Previous Projects</div>
            <div className="text-[10px] text-gray-400">{projects.length}</div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-6 px-4">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-gray-600">No projects yet</h3>
            </div>
          ) : (
            projects.map((p) => {
              const isSelected = p.id === selectedProjectId
              return (
                <div key={p.id} onClick={() => setSelectedProjectId(p.id)} className={`glass-card-hover px-3 py-2.5 cursor-pointer border ${isSelected ? 'border-brand-300 bg-brand-50/50' : 'border-transparent'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1"><StatusBadge status={p.status} /><span className="text-xs text-gray-400 capitalize px-2 py-0.5 bg-gray-100 rounded-md">{p.mode}</span></div>
                      <h3 className="text-xs font-medium text-gray-900 whitespace-normal break-words leading-5">{p.query}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400"><span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(p.created_at)}</span><span className="flex items-center gap-1 text-emerald-600"><Coins className="w-3 h-3" />{formatUsd(p.total_cost_usd)}</span></div>
                    </div>
                    <button onClick={(e) => handleDelete(p.id, e)} className="p-2 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="glass-card p-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-sm font-medium text-gray-700">{mode === 'discovery' ? 'Research Field or Question' : 'Research Question'}</label>
            <div className="flex items-center gap-2">
              <button onClick={handleDownloadConfigYaml} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Download YAML Config</button>
              <button onClick={() => configUploadInputRef.current?.click()} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Upload YAML Config</button>
              <input ref={configUploadInputRef} type="file" accept=".yaml,.yml,text/yaml,text/x-yaml" className="hidden" onChange={handleUploadConfigYaml} />
            </div>
          </div>
          <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === 'discovery' ? 'e.g., Single-cell RNA sequencing in tumor microenvironment...' : 'e.g., Analyze the differential expression patterns in this miRNA dataset...'} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm resize-y min-h-[130px] transition-all" />
          <button onClick={handleCreate} disabled={!query.trim() || creating} className={`mt-3 w-full py-3 text-white rounded-xl font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 ${mode === 'discovery' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-brand-600 hover:bg-brand-700'}`}>
            {creating ? <><Loader2 className="w-4 h-4 animate-spin" />{mode === 'discovery' ? 'Starting discovery...' : 'Starting analysis...'}</> : <>{mode === 'discovery' ? <Compass className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}{mode === 'discovery' ? 'Start Discovery' : 'Start Analysis'}</>}
          </button>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-xl font-semibold text-gray-900">Session Workspace</h2>
          <p className="text-sm text-gray-500 mt-1">Use the left sidebar for new sessions and previous projects. Project metrics and details are on the right.</p>
        </div>
      </section>

      <aside className="sticky top-0 self-start h-screen overflow-y-auto pl-1 space-y-4">
        <div className="glass-card p-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Project Details</h2>
            <p className="text-xs text-gray-500 mt-1">Selected project summary</p>
          </div>
          {selectedProject && <button onClick={() => navigate(`/project/${selectedProject.id}`)} className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors">Open</button>}
        </div>

        <div className="glass-card p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Project Summary</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total</div>
              <div className="text-lg font-semibold text-gray-900 mt-1">{projects.length}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Active</div>
              <div className="text-lg font-semibold text-blue-700 mt-1">{activeProjects}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Completed</div>
              <div className="text-lg font-semibold text-emerald-700 mt-1">{completedProjects}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Spend</div>
              <div className="text-lg font-semibold text-emerald-700 mt-1">{formatUsd(totalProjectCost)}</div>
            </div>
          </div>
        </div>

        {!selectedProject ? (
          <div className="glass-card p-4 text-sm text-gray-500">Select a project from the left sidebar to view its details here.</div>
        ) : (
          <div className="glass-card p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2"><StatusBadge status={selectedProject.status} /><span className="text-xs text-gray-400 capitalize px-2 py-0.5 bg-gray-100 rounded-md">{selectedProject.mode}</span></div>
              <h3 className="text-sm font-semibold text-gray-900 leading-5 break-words">{selectedProject.query}</h3>
              <p className="text-xs text-gray-400 mt-2 break-all">ID: {selectedProject.id}</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="text-[10px] uppercase tracking-wide text-gray-500">Created</div><div className="text-sm font-medium text-gray-900 mt-1">{timeAgo(selectedProject.created_at)}</div></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="text-[10px] uppercase tracking-wide text-gray-500">Files</div><div className="text-sm font-medium text-gray-900 mt-1">{selectedProject.files_count}</div></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="text-[10px] uppercase tracking-wide text-gray-500">Spend</div><div className="text-sm font-medium text-emerald-700 mt-1">{formatUsd(selectedProject.total_cost_usd)}</div></div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Project Progress</div>
                  <div className="text-xs font-medium text-gray-700">
                    {selectedProject.stages_completed}/{selectedProject.stages_total} steps
                  </div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${selectedProject.stages_total > 0 ? Math.min(100, Math.round((selectedProject.stages_completed / selectedProject.stages_total) * 100)) : 0}%` }}
                  />
                </div>
              </div>
              {selectedProject.discovery_phase && <div className="text-xs text-gray-500">Current phase: {selectedProject.discovery_phase}</div>}
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Stages Total</div>
                  <div className="mt-1 font-semibold text-gray-900">{selectedProject.stages_total}</div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Completed</div>
                  <div className="mt-1 font-semibold text-gray-900">{selectedProject.stages_completed}</div>
                </div>
              </div>
            </div>

            {selectedProject.max_cost_usd && selectedProject.max_cost_usd > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><div className="text-[10px] uppercase tracking-wide text-amber-700">Cost Limit</div><div className="text-sm font-medium text-amber-800 mt-1">{formatUsd(selectedProject.max_cost_usd)}</div></div>
            )}

            {selectedProject.llm_config && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Model Config</div>
                <div className="space-y-2">
                  {selectedProject.llm_config.planning_model && <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"><div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Planning</div><div className="mt-1 break-all">{selectedProject.llm_config.planning_model}</div></div>}
                  {selectedProject.llm_config.review_model && <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"><div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Review</div><div className="mt-1 break-all">{selectedProject.llm_config.review_model}</div></div>}
                  {selectedProject.llm_config.coding_model && <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700"><div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Coding</div><div className="mt-1 break-all">{selectedProject.llm_config.coding_model}</div></div>}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
