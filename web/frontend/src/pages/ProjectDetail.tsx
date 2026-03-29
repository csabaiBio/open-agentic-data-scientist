import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, StopCircle, FileText, Image, ScrollText, Loader2,
  Clock, BookOpen, Download, RefreshCw, BarChart3, Compass, Cpu, FlaskConical, Zap, GitBranch, Coins
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchProject, stopProject, resumeProject, updateProjectCostLimit, generatePaper, getPaperPdfUrl, confirmDiscovery, subscribeToEvents } from '../api'
import type { Project, ProjectEvent } from '../types'
import StatusBadge from '../components/StatusBadge'
import StageProgress from '../components/StageProgress'
import EventLog from '../components/EventLog'
import FigureGallery from '../components/FigureGallery'
import OutputPanel from '../components/OutputPanel'
import DiscoveryPanel from '../components/DiscoveryPanel'
import DataSuggestionsPanel from '../components/DataSuggestionsPanel'
import SkillsBadges from '../components/SkillsBadges'
import WorkflowGraph from '../components/WorkflowGraph'

type Tab = 'progress' | 'discovery' | 'figures' | 'files' | 'paper' | 'in_silico' | 'experimental' | 'graph'

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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [tab, setTab] = useState<Tab>('progress')
  const [autoSetTab, setAutoSetTab] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [generatingPaper, setGeneratingPaper] = useState(false)
  const [updatingCostLimit, setUpdatingCostLimit] = useState(false)
  const [costLimitInput, setCostLimitInput] = useState<string>('')
  const [paperContent, setPaperContent] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Load project data
  const loadProject = useCallback(async () => {
    if (!id) return
    try {
      const data = await fetchProject(id)
      setProject(data)
      setEvents(data.events || [])
      // Restore persisted paper content and PDF URL
      if (data.paper_content && !paperContent) {
        setPaperContent(data.paper_content)
      }
      const hasPdf = data.files?.some(f => f.name === 'paper.pdf')
      if (hasPdf && !pdfUrl) {
        setPdfUrl(getPaperPdfUrl(id))
      }
      setCostLimitInput(typeof data.max_cost_usd === 'number' && data.max_cost_usd > 0 ? String(data.max_cost_usd) : '')
    } catch (e) {
      console.error('Failed to load project:', e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadProject() }, [loadProject])

  // Auto-switch to discovery tab for discovery projects
  useEffect(() => {
    if (project && project.mode === 'discovery' && !autoSetTab) {
      setTab('discovery')
      setAutoSetTab(true)
    }
  }, [project, autoSetTab])

  // Subscribe to SSE when project is running
  useEffect(() => {
    if (!id || !project) return
    if (project.status !== 'running' && project.status !== 'pending') return

    const unsubscribe = subscribeToEvents(
      id,
      (event) => {
        setEvents(prev => [...prev, event])

        // Update project status from status events
        if (event.type === 'status' && event.metadata?.status) {
          setProject(prev => prev ? { ...prev, status: event.metadata.status } : prev)
        }

        // Track discovery phase changes
        if (event.metadata?.phase) {
          setProject(prev => prev ? { ...prev, discovery_phase: event.metadata.phase } : prev)
        }

        if (event.type === 'usage') {
          setProject(prev => prev ? {
            ...prev,
            total_cost_usd: typeof event.metadata?.total_cost_usd === 'number' ? event.metadata.total_cost_usd : prev.total_cost_usd,
            llm_calls: typeof event.metadata?.llm_call_index === 'number' ? event.metadata.llm_call_index : prev.llm_calls,
            total_prompt_tokens: prev.total_prompt_tokens + Number(event.metadata?.usage?.prompt_tokens || 0),
            total_completion_tokens: prev.total_completion_tokens + Number(event.metadata?.usage?.output_tokens || 0),
            total_cached_tokens: prev.total_cached_tokens + Number(event.metadata?.usage?.cached_input_tokens || 0),
            total_tokens: prev.total_tokens + Number(event.metadata?.usage?.total_tokens || 0),
          } : prev)
        }

        // When analysis starts (after confirm), switch to progress tab
        if (event.type === 'status' && event.metadata?.phase === 'analysis_start') {
          setTab('progress')
        }
      },
      (status) => {
        // Reload full project data when stream ends (completed, failed, stopped, awaiting_confirmation)
        loadProject()
      },
      events.length,
    )

    // Periodic refresh for skills_used, stages, files while running
    const refreshInterval = setInterval(() => {
      fetchProject(id).then(data => {
        setProject(prev => prev ? {
          ...prev,
          skills_used: data.skills_used || [],
          stages: data.stages,
          files: data.files,
        } : prev)
      }).catch(() => {})
    }, 5000)

    return () => {
      unsubscribe()
      clearInterval(refreshInterval)
    }
  }, [id, project?.status])

  // Handle discovery confirmation — user accepts or edits the research question
  const handleConfirmDiscovery = async (analysisQuery: string) => {
    if (!id) return
    try {
      await confirmDiscovery(id, analysisQuery)
      // Reload project to get running status, then SSE will re-subscribe
      await loadProject()
      setTab('progress')
    } catch (e) {
      console.error('Failed to confirm discovery:', e)
      alert('Failed to start analysis. Please try again.')
    }
  }

  // Periodic refresh for files (every 10s while running)
  useEffect(() => {
    if (!project || project.status !== 'running') return
    const interval = setInterval(loadProject, 10000)
    return () => clearInterval(interval)
  }, [project?.status, loadProject])

  const handleStop = async () => {
    if (!id) return
    setStopping(true)
    try {
      await stopProject(id)
      await loadProject()
    } catch (e) {
      console.error('Failed to stop:', e)
    } finally {
      setStopping(false)
    }
  }

  const handleResume = async () => {
    if (!id) return
    setResuming(true)
    try {
      await resumeProject(id)
      // loadProject fetches the full project — backend already scanned files on disk
      // so files/figures are immediately up-to-date after this call.
      const fresh = await fetchProject(id)
      setProject(fresh)
      setEvents(fresh.events || [])
    } catch (e) {
      console.error('Failed to resume:', e)
      alert('Failed to resume project. Please try again.')
    } finally {
      setResuming(false)
    }
  }

  const handleGeneratePaper = async () => {
    if (!id) return
    setGeneratingPaper(true)
    try {
      const result = await generatePaper(id)
      setPaperContent(result.content)
      setPdfUrl(getPaperPdfUrl(id))
      setTab('paper')
      await loadProject() // Refresh file list
    } catch (e) {
      console.error('Paper generation failed:', e)
      alert('Failed to generate paper. Make sure the project is completed.')
    } finally {
      setGeneratingPaper(false)
    }
  }

  const handleUpdateCostLimit = async () => {
    if (!id || !project) return
    setUpdatingCostLimit(true)
    try {
      const parsed = costLimitInput.trim() === '' ? undefined : Math.max(0, Number(costLimitInput))
      const updated = await updateProjectCostLimit(id, parsed)
      setProject(prev => prev ? {
        ...prev,
        status: (updated.status as typeof prev.status),
        max_cost_usd: updated.max_cost_usd,
        total_cost_usd: updated.total_cost_usd,
      } : prev)
      await loadProject()
    } catch (e) {
      console.error('Failed to update cost limit:', e)
      alert('Failed to update cost limit. Please try again.')
    } finally {
      setUpdatingCostLimit(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Project not found</p>
        <Link to="/" className="text-brand-600 text-sm mt-2 inline-block">Back to projects</Link>
      </div>
    )
  }

  const figureCount = project.files.filter(f => f.type === 'figure').length
  const fileCount = project.files.filter(f => f.type !== 'figure').length
  const isRunning = project.status === 'running' || project.status === 'pending'
  const isCompleted = project.status === 'completed'
  const isResumable = project.status === 'stopped' || project.status === 'failed'
  const isAwaitingConfirmation = project.status === 'awaiting_confirmation'

  const isDiscovery = project.mode === 'discovery'
  const discoveryPaperCount = project.discovery?.papers?.length ?? 0

  const tabs: { key: Tab; label: string; icon: typeof ScrollText; count?: number }[] = [
    ...(isDiscovery ? [{ key: 'discovery' as Tab, label: 'Discovery', icon: Compass, count: discoveryPaperCount }] : []),
    { key: 'progress', label: 'Progress', icon: BarChart3 },
    { key: 'figures', label: 'Figures', icon: Image, count: figureCount },
    { key: 'files', label: 'Files', icon: FileText, count: fileCount },
    { key: 'paper', label: 'Paper', icon: BookOpen },
    { key: 'in_silico', label: 'In-Silico Data', icon: Cpu },
    { key: 'experimental', label: 'Experimental Data', icon: FlaskConical },
    { key: 'graph', label: 'Graph', icon: GitBranch },
  ]

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </Link>

        <div className="glass-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <StatusBadge status={project.status} />
                <span className="text-xs text-gray-400 capitalize px-2 py-0.5 bg-gray-100 rounded-md">
                  {project.mode}
                </span>
                {project.duration !== null && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(project.duration)}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-gray-900 leading-snug">{project.query}</h1>
              <span className="font-mono text-xs text-gray-400 select-all mt-0.5 block" title="Project ID">ID: {project.id}</span>
              {project.input_files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {project.input_files.map(f => (
                    <span key={f} className="text-xs px-2 py-0.5 bg-gray-100 rounded-md text-gray-500">{f}</span>
                  ))}
                </div>
              )}
              {project.error && (
                <div className="mt-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                  {project.error}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0">
              <div className="min-w-[140px] rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2 text-emerald-700 mb-1">
                  <Coins className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Project Cost</span>
                </div>
                <div className="text-xl font-bold text-emerald-900">{formatUsd(project.total_cost_usd)}</div>
                {typeof project.max_cost_usd === 'number' && project.max_cost_usd > 0 && (
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {formatUsd(project.total_cost_usd)} / {formatUsd(project.max_cost_usd)}
                  </div>
                )}
                <div className="text-[11px] text-emerald-700 mt-1">{project.llm_calls} LLM call{project.llm_calls === 1 ? '' : 's'}</div>
                <div className="mt-2 flex items-center gap-1 justify-end">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costLimitInput}
                    onChange={(e) => setCostLimitInput(e.target.value)}
                    placeholder="Set limit"
                    className="w-24 px-2 py-1 text-[11px] rounded-md border border-emerald-200 bg-white text-right text-emerald-900 outline-none"
                  />
                  <button
                    onClick={handleUpdateCostLimit}
                    disabled={updatingCostLimit}
                    className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {updatingCostLimit ? '...' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  onClick={handleStop}
                  disabled={stopping}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                  Stop
                </button>
              )}
              {isResumable && (
                <button
                  onClick={handleResume}
                  disabled={resuming}
                  className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Resume
                </button>
              )}
              {isCompleted && (
                <button
                  onClick={handleGeneratePaper}
                  disabled={generatingPaper}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {generatingPaper ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                  Write Paper
                </button>
              )}
              <button
                onClick={loadProject}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {tab === 'discovery' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Compass className="w-4 h-4 text-violet-500" />
                Literature Discovery
                {project.discovery_phase && project.discovery_phase !== 'done' && (
                  <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                )}
              </h3>
              <DiscoveryPanel
                discovery={project.discovery}
                discoveryPhase={project.discovery_phase}
                events={events}
                analysisQuery={project.analysis_query}
                isAwaitingConfirmation={isAwaitingConfirmation}
                onConfirm={handleConfirmDiscovery}
              />
            </div>
          </div>
        )}

        {tab === 'progress' && (
          <>
            {/* Stages + Skills panel */}
            <div className="lg:col-span-1 space-y-4">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-brand-500" />
                  Stages
                </h3>
                <StageProgress stages={project.stages} projectStartedAt={project.started_at} isRunning={isRunning} />
              </div>
              {project.llm_config && (
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    Model Config
                  </h3>
                  <div className="space-y-2 text-xs">
                    {project.mode !== 'simple' && project.llm_config.planning_model && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">Planning</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {project.llm_config.planning_provider && (
                            <span className="font-medium text-gray-700 bg-indigo-50 px-2 py-0.5 rounded whitespace-nowrap">
                              {project.llm_config.planning_provider === 'local' ? 'Local' : project.llm_config.planning_provider}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-gray-600 truncate max-w-[140px]" title={project.llm_config.planning_model}>
                            {project.llm_config.planning_model.split('/').pop()}
                          </span>
                        </div>
                      </div>
                    )}
                    {project.mode !== 'simple' && project.llm_config.review_model && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">Review</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {project.llm_config.review_provider && (
                            <span className="font-medium text-gray-700 bg-indigo-50 px-2 py-0.5 rounded whitespace-nowrap">
                              {project.llm_config.review_provider === 'local' ? 'Local' : project.llm_config.review_provider}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-gray-600 truncate max-w-[140px]" title={project.llm_config.review_model}>
                            {project.llm_config.review_model.split('/').pop()}
                          </span>
                        </div>
                      </div>
                    )}
                    {project.mode !== 'discovery' && project.llm_config.coding_model && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-500">Coding</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {project.llm_config.coding_provider && (
                            <span className="font-medium text-gray-700 bg-indigo-50 px-2 py-0.5 rounded whitespace-nowrap">
                              {project.llm_config.coding_provider === 'local' ? 'Local' : project.llm_config.coding_provider}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-gray-600 truncate max-w-[140px]" title={project.llm_config.coding_model}>
                            {project.llm_config.coding_model.split('/').pop()}
                          </span>
                        </div>
                      </div>
                    )}
                    {project.llm_config.openai_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">OpenAI Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.openai_api_base}</span>
                      </div>
                    )}
                    {project.llm_config.anthropic_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Anthropic Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.anthropic_api_base}</span>
                      </div>
                    )}
                    {project.llm_config.local_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Local Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.local_api_base}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Skills Used
                  {isRunning && <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />}
                </h3>
                <SkillsBadges skills={project.skills_used || []} isRunning={isRunning} />
              </div>
            </div>
            {/* Event log */}
            <div className="lg:col-span-2">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-brand-500" />
                  Activity Log
                  {isRunning && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                </h3>
                <EventLog events={events} />
              </div>
            </div>
          </>
        )}

        {tab === 'figures' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Image className="w-4 h-4 text-brand-500" />
                Generated Figures
              </h3>
              <FigureGallery projectId={project.id} files={project.files} />
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-500" />
                Output Files
              </h3>
              <OutputPanel projectId={project.id} files={project.files} />
            </div>
          </div>
        )}

        {tab === 'paper' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-brand-500" />
                Research Paper
              </h3>
              {paperContent || pdfUrl ? (
                <div className="space-y-4">
                  {/* Action bar */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {pdfUrl && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg font-medium">
                          PDF Ready
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {pdfUrl && (
                        <button
                          onClick={() => {
                            const a = document.createElement('a')
                            a.href = pdfUrl
                            a.download = 'paper.pdf'
                            a.click()
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download PDF
                        </button>
                      )}
                      {paperContent && (
                        <button
                          onClick={() => {
                            const a = document.createElement('a')
                            a.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(paperContent)}`
                            a.download = 'paper.md'
                            a.click()
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Markdown
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PDF Viewer */}
                  {pdfUrl && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50" style={{ height: '75vh' }}>
                      <iframe
                        src={pdfUrl}
                        className="w-full h-full"
                        title="Research Paper PDF"
                        style={{ border: 'none' }}
                      />
                    </div>
                  )}

                  {/* Fallback: Markdown view if no PDF */}
                  {!pdfUrl && paperContent && (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="prose prose-sm max-w-none
                        prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                        prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                        prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2
                        prose-strong:text-gray-800 prose-strong:font-semibold
                        prose-ul:my-2 prose-ul:pl-5 prose-li:my-1 prose-li:text-gray-600
                        prose-ol:my-2 prose-ol:pl-5
                        prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono
                        prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:text-xs prose-pre:p-3
                        prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-3 prose-blockquote:text-gray-500 prose-blockquote:italic
                        prose-hr:my-6 prose-hr:border-gray-200
                        font-serif"
                    >
                      {paperContent}
                    </ReactMarkdown>
                  )}
                </div>
              ) : isCompleted ? (
                <div className="text-center py-12">
                  <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 mb-4">Generate a comprehensive research paper from all analysis outputs</p>
                  <button
                    onClick={handleGeneratePaper}
                    disabled={generatingPaper}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {generatingPaper ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                    {generatingPaper ? 'Generating...' : 'Write Paper'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">Complete the analysis first to generate a paper</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'in_silico' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-500" />
                New In-Silico Data
              </h3>
              <DataSuggestionsPanel projectId={project.id} type="in_silico" isCompleted={isCompleted} initialContent={project.in_silico_suggestions} />
            </div>
          </div>
        )}

        {tab === 'experimental' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-500" />
                New Experimental Data
              </h3>
              <DataSuggestionsPanel projectId={project.id} type="experimental" isCompleted={isCompleted} initialContent={project.experimental_suggestions} />
            </div>
          </div>
        )}

        {tab === 'graph' && (
          <div className="lg:col-span-3">
            <div className="glass-card p-5 relative">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-violet-500" />
                Workflow Graph
                {isRunning && <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />}
              </h3>
              <WorkflowGraph events={events} isRunning={isRunning} projectId={project.id} files={project.files} stages={project.stages} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
