import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Clock, FileStack, Trash2, Loader2, Upload, X, Sparkles, Compass, Settings2, ChevronDown, ChevronUp, Cpu, Globe, Server, Coins } from 'lucide-react'
import { fetchProjects, createProject, deleteProject } from '../api'
import type { ProjectSummary, ProjectMode } from '../types'
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

export default function Dashboard() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ProjectMode>('orchestrated')
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [numPapers, setNumPapers] = useState(10)
  const [daysBack, setDaysBack] = useState(30)
  const [showModelSettings, setShowModelSettings] = useState(false)
  const [modelProvider, setModelProvider] = useState<string>('')
  const [planningModel, setPlanningModel] = useState('')
  const [codingModel, setCodingModel] = useState('')
  const [modelApiBase, setModelApiBase] = useState('')
  const [modelApiKey, setModelApiKey] = useState('')
  const [baseProjectId, setBaseProjectId] = useState<string>('')

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

  useEffect(() => { load() }, [load])

  // Auto-refresh running projects
  useEffect(() => {
    const hasRunning = projects.some(p => p.status === 'running' || p.status === 'pending')
    if (!hasRunning) return
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [projects, load])

  const handleCreate = async () => {
    if (!query.trim()) return
    setCreating(true)
    try {
      const project = await createProject({
        query, mode, files, numPapers, daysBack,
        modelProvider: modelProvider || undefined,
        planningModel: planningModel || undefined,
        codingModel: codingModel || undefined,
        modelApiBase: modelApiBase || undefined,
        modelApiKey: modelApiKey || undefined,
        baseProjectId: baseProjectId || undefined,
      })
      navigate(`/project/${project.id}`)
    } catch (e) {
      console.error('Failed to create project:', e)
      alert('Failed to create project. Check the console for details.')
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage your data science analyses</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl font-medium text-sm shadow-sm hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* New Project Panel */}
      {showNew && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              New Analysis
            </h2>
            <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Query */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {mode === 'discovery' ? 'Research Field or Question' : 'Research Question'}
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'discovery'
                  ? 'e.g., Single-cell RNA sequencing in tumor microenvironment...'
                  : 'e.g., Analyze the differential expression patterns in this miRNA dataset...'}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm resize-none h-24 transition-all"
              />
            </div>

            {/* Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Analysis Mode</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setMode('orchestrated')}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    mode === 'orchestrated'
                      ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Orchestrated</div>
                  <div className="text-xs mt-0.5 opacity-70">Multi-agent with planning & review</div>
                </button>
                <button
                  onClick={() => setMode('simple')}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    mode === 'simple'
                      ? 'border-brand-400 bg-brand-50 text-brand-700 ring-2 ring-brand-100'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">Simple</div>
                  <div className="text-xs mt-0.5 opacity-70">Direct coding, faster & cheaper</div>
                </button>
                <button
                  onClick={() => setMode('discovery')}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    mode === 'discovery'
                      ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    Discovery
                  </div>
                  <div className="text-xs mt-0.5 opacity-70">PubMed literature + novel hypothesis</div>
                </button>
              </div>
            </div>

            {/* Discovery Settings */}
            {mode === 'discovery' && (
              <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-100 space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                  <Compass className="w-4 h-4" />
                  Discovery Settings
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-gray-600">Number of papers</label>
                    <span className="text-sm font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">{numPapers}</span>
                  </div>
                  <input
                    type="range" min={1} max={20} value={numPapers}
                    onChange={(e) => setNumPapers(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full bg-violet-200 appearance-none cursor-pointer accent-violet-600"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-gray-600">Look back period</label>
                    <span className="text-sm font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-md">{daysBack} days</span>
                  </div>
                  <input
                    type="range" min={1} max={180} value={daysBack}
                    onChange={(e) => setDaysBack(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full bg-violet-200 appearance-none cursor-pointer accent-violet-600"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>1d</span><span>30d</span><span>90d</span><span>180d</span>
                  </div>
                </div>
                <p className="text-xs text-violet-600/70 leading-relaxed">
                  Discovery mode fetches the top papers from PubMed, synthesizes research trends, and formulates a novel hypothesis with a concrete analysis plan. After discovery, the automated analysis runs just like the other modes.
                </p>
              </div>
            )}

            {/* Files */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Input Files <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-300 cursor-pointer transition-colors bg-gray-50/50">
                <Upload className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">
                  {files.length > 0 ? `${files.length} file(s) selected` : 'Click to upload files'}
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </label>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-lg text-xs text-gray-600">
                      {f.name}
                      <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                        <X className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Base Project (optional inheritance) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Build on Previous Project <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={baseProjectId}
                onChange={(e) => setBaseProjectId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none text-sm transition-all bg-white"
              >
                <option value="">Start from scratch</option>
                {projects
                  .filter(p => p.status === 'completed')
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.query.slice(0, 60)}{p.query.length > 60 ? '...' : ''} ({p.files_count} files)
                    </option>
                  ))}
              </select>
              {baseProjectId && (
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  All scripts, data, and results from the selected project will be copied to the new project. The agent can build on top of this existing work.
                </p>
              )}
            </div>

            {/* Model Settings */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowModelSettings(!showModelSettings)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-gray-400" />
                  Model Settings
                  {modelProvider && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-semibold">
                      {modelProvider === 'local'
                        ? 'Local'
                        : modelProvider === 'openrouter'
                          ? 'OpenRouter'
                          : modelProvider === 'openai'
                            ? 'OpenAI'
                            : modelProvider === 'anthropic'
                              ? 'Anthropic'
                              : 'Bedrock'}
                    </span>
                  )}
                </span>
                {showModelSettings ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showModelSettings && (
                <div className="px-4 pb-4 space-y-4 border-t border-gray-100 animate-fade-in">
                  {/* Provider */}
                  <div className="pt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Provider</label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { id: '', label: 'Default (env)', icon: Cpu, desc: 'From .env config' },
                        { id: 'bedrock', label: 'Bedrock', icon: Cpu, desc: 'AWS Bedrock' },
                        { id: 'openai', label: 'OpenAI', icon: Cpu, desc: 'OpenAI API' },
                        { id: 'anthropic', label: 'Anthropic', icon: Cpu, desc: 'Anthropic API' },
                        { id: 'openrouter', label: 'OpenRouter', icon: Globe, desc: 'OpenRouter API' },
                        { id: 'local', label: 'Local', icon: Server, desc: 'vLLM / Ollama / HF' },
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setModelProvider(p.id)
                            // Set preset models when switching provider
                            if (p.id === 'bedrock') {
                              setPlanningModel('bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0')
                              setCodingModel('us.anthropic.claude-sonnet-4-5-20250929-v1:0')
                              setModelApiBase('')
                            } else if (p.id === 'openai') {
                              setPlanningModel('openai/gpt-4.1-mini')
                              setCodingModel('')
                              setModelApiBase('')
                            } else if (p.id === 'anthropic') {
                              setPlanningModel('claude-sonnet-4-5')
                              setCodingModel('claude-sonnet-4-5')
                              setModelApiBase('')
                            } else if (p.id === 'openrouter') {
                              setPlanningModel('anthropic/claude-sonnet-4')
                              setCodingModel('claude-sonnet-4-5-20250929')
                              setModelApiBase('')
                            } else if (p.id === 'local') {
                              setPlanningModel('Qwen/Qwen3-Coder-480B-A35B-Instruct')
                              setCodingModel('')
                              setModelApiBase('http://localhost:8000/v1')
                            } else {
                              setPlanningModel('')
                              setCodingModel('')
                              setModelApiBase('')
                            }
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            modelProvider === p.id
                              ? 'border-brand-400 bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          <p.icon className="w-3.5 h-3.5 mx-auto mb-1" />
                          <div>{p.label}</div>
                          <div className="text-[9px] opacity-60 mt-0.5">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {modelProvider && (
                    <>
                      {/* Planning Model */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Planning / Review Model
                        </label>
                        <input
                          value={planningModel}
                          onChange={e => setPlanningModel(e.target.value)}
                          placeholder={modelProvider === 'local' ? 'Qwen/Qwen3-Coder-480B-A35B-Instruct' : 'Model ID'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-100 outline-none"
                        />
                        {modelProvider === 'local' && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {[
                              'Qwen/Qwen3-Coder-480B-A35B-Instruct',
                              'Qwen/Qwen2.5-Coder-32B-Instruct',
                              'deepseek-ai/DeepSeek-R1-0528',
                              'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
                            ].map(m => (
                              <button
                                key={m}
                                onClick={() => setPlanningModel(m)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  planningModel === m ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-400 hover:text-gray-600'
                                }`}
                              >
                                {m.split('/').pop()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Coding Model */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Coding Model <span className="text-gray-300">(Claude Code SDK)</span>
                        </label>
                        <input
                          value={codingModel}
                          onChange={e => setCodingModel(e.target.value)}
                          placeholder="Leave empty for default"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-100 outline-none"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                          Coding uses Claude Code CLI (requires Anthropic or Bedrock credentials)
                        </p>
                      </div>

                      {/* API Base (for local) */}
                      {modelProvider === 'local' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            API Base URL
                          </label>
                          <input
                            value={modelApiBase}
                            onChange={e => setModelApiBase(e.target.value)}
                            placeholder="http://localhost:8000/v1"
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-100 outline-none font-mono"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            URL of your local inference server (vLLM, Ollama, TGI, etc.)
                          </p>
                        </div>
                      )}

                      {/* API Key (optional) */}
                      {(modelProvider === 'openrouter' || modelProvider === 'openai' || modelProvider === 'anthropic' || modelProvider === 'local') && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            API Key <span className="text-gray-300">(optional)</span>
                          </label>
                          <input
                            type="password"
                            value={modelApiKey}
                            onChange={e => setModelApiKey(e.target.value)}
                            placeholder={modelProvider === 'local' ? 'Not needed for most local servers' : 'API key'}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-100 outline-none"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {!modelProvider && (
                    <p className="text-xs text-gray-400 pt-1">
                      Using default models from environment configuration. Select a provider to customize.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleCreate}
              disabled={!query.trim() || creating}
              className={`w-full py-3 text-white rounded-xl font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 ${
                mode === 'discovery'
                  ? 'bg-violet-600 hover:bg-violet-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === 'discovery' ? 'Starting discovery...' : 'Starting analysis...'}
                </>
              ) : (
                <>
                  {mode === 'discovery' ? <Compass className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {mode === 'discovery' ? 'Start Discovery' : 'Start Analysis'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">No projects yet</h3>
          <p className="text-sm text-gray-400 mt-1">Create your first analysis to get started</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/project/${p.id}`)}
              className="glass-card-hover px-5 py-4 cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-gray-400 capitalize px-2 py-0.5 bg-gray-100 rounded-md">
                      {p.mode}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 truncate">{p.query}</h3>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(p.created_at)}
                    </span>
                    {p.duration !== null && (
                      <span>Duration: {formatDuration(p.duration)}</span>
                    )}
                    {p.stages_total > 0 && (
                      <span>Stages: {p.stages_completed}/{p.stages_total}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <FileStack className="w-3 h-3" />
                      {p.files_count} files
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Coins className="w-3 h-3" />
                      {formatUsd(p.total_cost_usd)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(p.id, e)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
