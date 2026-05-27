import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, StopCircle, FileText, Image, ScrollText, Loader2,
  Clock, BookOpen, Download, RefreshCw, BarChart3, Compass, Cpu, FlaskConical, Zap, GitBranch, Coins,
  Activity, Terminal, Globe, Bot, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchProject, stopProject, resumeProject, updateProjectCostLimit, generatePaper, getPaperPdfUrl, confirmDiscovery, subscribeToEvents, answerQuestion } from '../api'
import type { Project, ProjectEvent, Stage } from '../types'
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

function formatRelativeTime(iso: string | null, nowMs: number): string {
  if (!iso) return 'unknown'
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return 'unknown'
  const diffSecs = Math.max(0, Math.round((nowMs - timestamp) / 1000))
  return `${formatDuration(diffSecs)} ago`
}

type ActivitySummary = {
  label: string
  detail: string
  tone: 'neutral' | 'active' | 'network' | 'warning'
  timestamp: string | null
}

function extractToolCallSummary(event: ProjectEvent): ActivitySummary {
  const args = event.metadata?.arguments || {}
  const command = typeof args.command === 'string' ? args.command.trim() : ''
  const description = typeof args.description === 'string' ? args.description.trim() : ''
  const toolName = String(event.content || '').trim()
  const haystack = `${toolName} ${description} ${command}`.toLowerCase()
  const detail = description || command || toolName || 'Running tool'

  if (/(curl|wget|http|https|fetch|download|pubmed|encode|requests?\.|web|browser)/i.test(haystack)) {
    return {
      label: 'Fetching external resources',
      detail,
      tone: 'network',
      timestamp: event.timestamp,
    }
  }

  if (toolName === 'Bash') {
    return {
      label: 'Running script or shell command',
      detail,
      tone: 'active',
      timestamp: event.timestamp,
    }
  }

  return {
    label: `Running ${toolName || 'tool'}`,
    detail,
    tone: 'active',
    timestamp: event.timestamp,
  }
}

function extractActivitySummary(events: ProjectEvent[], runningStage: Stage | undefined): ActivitySummary {
  const meaningful = [...events].reverse().find(event => {
    if (event.type === 'tool_result' || event.type === 'thought') return false
    if (event.type === 'message' && !event.content.trim()) return false
    return true
  })

  if (!meaningful) {
    return {
      label: 'Waiting for first activity',
      detail: runningStage ? `Stage ${runningStage.index + 1}: ${runningStage.title}` : 'Project is queued and waiting to start.',
      tone: 'neutral',
      timestamp: null,
    }
  }

  if (meaningful.type === 'tool_call') {
    return extractToolCallSummary(meaningful)
  }

  if (meaningful.type === 'usage') {
    return {
      label: 'Waiting on model response',
      detail: typeof meaningful.metadata?.model === 'string' ? meaningful.metadata.model : meaningful.content || 'LLM call in progress',
      tone: 'active',
      timestamp: meaningful.timestamp,
    }
  }

  if (meaningful.type === 'status') {
    return {
      label: 'Updating workflow status',
      detail: meaningful.content || 'Status update received',
      tone: 'neutral',
      timestamp: meaningful.timestamp,
    }
  }

  if (meaningful.type === 'error') {
    return {
      label: 'Execution error',
      detail: meaningful.content || 'The workflow reported an error.',
      tone: 'warning',
      timestamp: meaningful.timestamp,
    }
  }

  const author = meaningful.author.replace(/_/g, ' ').trim()
  const content = meaningful.content.trim().replace(/\s+/g, ' ')
  return {
    label: author ? `${author} activity` : 'Workflow activity',
    detail: content || 'Processing current step',
    tone: 'neutral',
    timestamp: meaningful.timestamp,
  }
}

function getStageDurationLabel(stage: Stage | undefined, nowMs: number): string | null {
  if (!stage) return null

  if (typeof stage.duration_seconds === 'number' && stage.duration_seconds >= 0) {
    return formatDuration(stage.duration_seconds)
  }

  if (stage.started_at) {
    const startedMs = new Date(stage.started_at).getTime()
    if (Number.isFinite(startedMs)) {
      return formatDuration(Math.max(0, (nowMs - startedMs) / 1000))
    }
  }

  return null
}

function LiveActivityCard({
  events,
  stages,
  isRunning,
  nowMs,
  projectStartedAt,
}: {
  events: ProjectEvent[]
  stages: Stage[]
  isRunning: boolean
  nowMs: number
  projectStartedAt: string | null
}) {
  const runningStage = stages.find(stage => stage.status === 'running')
  const pendingStage = stages.find(stage => stage.status === 'pending')
  const activity = extractActivitySummary(events, runningStage)
  const stageDurationText = getStageDurationLabel(runningStage, nowMs)
  // const lastUpdateText = formatRelativeTime(activity.timestamp, nowMs)
  const lastUpdateMs = activity.timestamp ? new Date(activity.timestamp).getTime() : NaN
  const secondsSinceUpdate = Number.isFinite(lastUpdateMs) ? Math.max(0, Math.round((nowMs - lastUpdateMs) / 1000)) : null
  const isStale = isRunning && secondsSinceUpdate !== null && secondsSinceUpdate >= 30

  const toneClasses = {
    neutral: 'border-sky-100 bg-sky-50/70 text-sky-700',
    active: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
    network: 'border-violet-100 bg-violet-50/70 text-violet-700',
    warning: 'border-amber-200 bg-amber-50/80 text-amber-800',
  } as const

  const toneIcon = {
    neutral: Activity,
    active: Terminal,
    network: Globe,
    warning: AlertTriangle,
  } as const

  const ToneIcon = toneIcon[isStale ? 'warning' : activity.tone]
  const toneClassName = toneClasses[isStale ? 'warning' : activity.tone]

  return (
    <div className="glass-card p-5">
      
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Activity className="w-4 h-4 text-brand-500" />
            Current Activity
            {isRunning && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${toneClassName}`}>
              <ToneIcon className="w-3.5 h-3.5" />
              {isStale ? 'No recent update' : activity.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
              <BarChart3 className="w-3.5 h-3.5" />
              {runningStage
                ? `Stage ${runningStage.index + 1}: ${runningStage.title}`
                : pendingStage
                ? `Next: Stage ${pendingStage.index + 1}: ${pendingStage.title}`
                : 'No active stage'}
            </span>
            {/* <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              Last update {lastUpdateText}
            </span> */}
            {stageDurationText && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                Step duration {stageDurationText}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-600 break-words">
            {isStale
              ? 'The workflow has not emitted a new event recently. It may still be inside a long-running script, network request, or model call.'
              : activity.detail}
          </p>

          {pendingStage && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-medium text-gray-700">Next stage:</span>{' '}
              Stage {pendingStage.index + 1}: {pendingStage.title}
            </div>
          )}

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <BarChart3 className="w-4 h-4 text-brand-500" />
              Stages
            </div>
            <StageProgress stages={stages} projectStartedAt={projectStartedAt} isRunning={isRunning} />
          </div>
        </div>
        <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
          {activity.tone === 'network' ? <Globe className="w-5 h-5" /> : activity.tone === 'active' ? <Terminal className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>
      </div>
    </div>
  )
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
  const [nowMs, setNowMs] = useState(Date.now())
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false)
  const [isModelConfigCollapsed, setIsModelConfigCollapsed] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<{ questionId: string; question: string } | null>(null)
  const [answerInput, setAnswerInput] = useState('')
  const [answering, setAnswering] = useState(false)

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

        if (event.type === 'user_question') {
          const questionId = String(event.metadata?.question_id || '')
          if (questionId) {
            setPendingQuestion({ questionId, question: event.content || 'Please provide clarification.' })
            setTab('progress')
          }
        }

        if (event.type === 'user_answer') {
          const answeredId = String(event.metadata?.question_id || '')
          setPendingQuestion(prev => (prev && prev.questionId === answeredId ? null : prev))
          setAnswerInput('')
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

  useEffect(() => {
    if (!project || (project.status !== 'running' && project.status !== 'pending')) return
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [project?.status])

  const handleSubmitAnswer = async () => {
    if (!id || !pendingQuestion) return
    const trimmed = answerInput.trim()
    if (!trimmed) return
    setAnswering(true)
    try {
      await answerQuestion(id, pendingQuestion.questionId, trimmed)
      setPendingQuestion(null)
      setAnswerInput('')
    } catch (e) {
      console.error('Failed to answer question:', e)
      alert('Failed to submit answer. Please try again.')
    } finally {
      setAnswering(false)
    }
  }

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

  const handleDownloadProjectConfig = () => {
    if (!project) return
    const c = project.llm_config
    const scalar = (v: string | number | boolean | null | undefined) => {
      if (v === null || v === undefined) return 'null'
      if (typeof v === 'string') return JSON.stringify(v)
      return String(v)
    }
    const fields: Record<string, string | number | boolean | null | undefined> = {
      query: project.query,
      mode: project.mode,
      num_papers: project.num_papers,
      days_back: project.days_back,
      planning_model: c?.planning_model ?? '',
      review_model: c?.review_model ?? '',
      coding_model: c?.coding_model ?? '',
      planning_api_base: c?.planning_api_base ?? '',
      review_api_base: c?.review_api_base ?? '',
      coding_api_base: c?.coding_api_base ?? '',
      max_cost_usd: project.max_cost_usd,
      base_project_id: '',
    }
    const lines = [
      '# Agentic Data Scientist Dashboard Config',
      `# Exported from project ${project.id}`,
    ]
    for (const [key, value] of Object.entries(fields)) {
      lines.push(`${key}: ${scalar(value)}`)
    }
    const yaml = lines.join('\n') + '\n'
    const blob = new Blob([yaml], { type: 'application/x-yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `project-${project.id.slice(0, 8)}-config.yaml`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
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
  const isPausedForInput = !!pendingQuestion

  const isDiscovery = project.mode === 'discovery'
  const discoveryPaperCount = project.discovery?.papers?.length ?? 0
  const contentGridClass = isRightSidebarCollapsed
    ? 'grid grid-cols-1 lg:grid-cols-4 gap-6'
    : 'grid grid-cols-1 lg:grid-cols-5 gap-6'

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
        {/* <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </Link> */}

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
              <div className="flex items-center gap-2">
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
              <button
                onClick={() => setIsRightSidebarCollapsed(prev => !prev)}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                title={isRightSidebarCollapsed ? 'Show right sidebar' : 'Hide right sidebar'}
              >
                {isRightSidebarCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {isRightSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>

             {tab === 'figures' && (
          <div className="lg:col-span-3 lg:col-start-2">
            <div className="glass-card p-5">
                  
              <FigureGallery projectId={project.id} files={project.files} />
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="lg:col-span-3 lg:col-start-2">
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
          <div className="lg:col-span-3 lg:col-start-2">
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
          <div className="lg:col-span-3 lg:col-start-2">
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
          <div className="lg:col-span-3 lg:col-start-2">
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
          <div className="lg:col-span-3 lg:col-start-2">
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

      {/* Tab Content */}
      <div className={contentGridClass}>
        {tab === 'discovery' && (
          <div className="lg:col-span-3 lg:col-start-2">
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

        {/* {tab === 'progress' && ( */}
          <>
            
            {/* Stages + Skills panel */}
            <div className="lg:col-span-1 space-y-4">
              <span className="font-mono text-xs text-gray-400 select-all mt-0.5 block" title="Project ID">ID: {project.id}</span>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center justify-between gap-2 text-emerald-700 mb-1">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Project Cost</span>
                
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {formatUsd(project.total_cost_usd)} / <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costLimitInput}
                    onChange={(e) => setCostLimitInput(e.target.value)}
                    placeholder="Set limit"
                    className="w-14 px-2 py-1 text-[11px] rounded-md border border-emerald-200 bg-white text-right text-emerald-900 outline-none"
                  />
                  <button
                    onClick={handleUpdateCostLimit}
                    disabled={updatingCostLimit}
                    className="px-1 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {updatingCostLimit ? '...' : 'Update'}
                  </button>
                  </div>
      </div>
                </div>
                
                <div className="mt-3 flex items-center gap-2">
                  {isRunning && (
                    <button
                      onClick={handleStop}
                      disabled={stopping}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {stopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Stop
                    </button>
                  )}
                  {isResumable && (
                    <button
                      onClick={handleResume}
                      disabled={resuming}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-50"
                    >
                      {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Resume
                    </button>
                  )}
                  <span className="text-[11px] text-emerald-700">{project.llm_calls} call{project.llm_calls === 1 ? '' : 's'}</span>

                </div>
              </div>

                <LiveActivityCard
                  events={events}
                  stages={project.stages}
                  isRunning={isRunning}
                  nowMs={nowMs}
                  projectStartedAt={project.started_at}
                />
              {project.llm_config && (
                <div className="glass-card p-5">
                  <div className="text-sm font-semibold text-gray-700 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setIsModelConfigCollapsed(prev => !prev)}
                      className="flex items-center gap-2 text-left"
                    >
                      <Cpu className="w-4 h-4 text-indigo-500" />
                      Model Config
                      {isModelConfigCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
                    </button>
                    <button
                      onClick={handleDownloadProjectConfig}
                      title="Download YAML config"
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {!isModelConfigCollapsed && <div className="space-y-2 text-xs mt-3">
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
                    {project.llm_config.planning_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Planning Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.planning_api_base}</span>
                      </div>
                    )}
                    {project.llm_config.review_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Review Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.review_api_base}</span>
                      </div>
                    )}
                    {project.llm_config.coding_api_base && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Coding Base</span>
                        <span className="font-mono text-[10px] text-gray-600 truncate max-w-[180px]">{project.llm_config.coding_api_base}</span>
                      </div>
                    )}
                  </div>}
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
            <div className="lg:col-span-3">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-brand-500" />
                  Activity Log
                  {isRunning && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                  {isPausedForInput && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Awaiting your input</span>}
                </h3>
                {isPausedForInput && pendingQuestion && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Agent needs your input</div>
                    <pre className="text-sm text-amber-900 mb-3 whitespace-pre-wrap font-sans leading-relaxed">{pendingQuestion.question}</pre>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        placeholder="Type your answer and submit to continue"
                        className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-amber-300"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleSubmitAnswer()
                          }
                        }}
                      />
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={answering || !answerInput.trim()}
                        className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                      >
                        {answering ? 'Sending...' : 'Submit answer'}
                      </button>
                    </div>
                  </div>
                )}
                <EventLog events={events} stages={project.stages} />
              </div>
            </div>
          </>
        {/* )} */}

 

        {!isRightSidebarCollapsed && (
          <div className="hidden lg:block lg:col-span-1">
            <div className="space-y-4 sticky top-6">
              <div className="glass-card p-4">



                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Project Snapshot</h3>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center justify-between gap-2">
                    <span>Status</span>
                    <StatusBadge status={project.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Figures</span>
                    <span className="font-semibold text-gray-800">{figureCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Files</span>
                    <span className="font-semibold text-gray-800">{fileCount}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Cost</span>
                    <span className="font-semibold text-gray-800">{formatUsd(project.total_cost_usd)}</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Quick Jump</h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {tabs.slice(0, 6).map(t => {
                    const active = tab === t.key
                    return (
                      <button
                        key={`quick-${t.key}`}
                        onClick={() => setTab(t.key)}
                        className={`text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                          active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
