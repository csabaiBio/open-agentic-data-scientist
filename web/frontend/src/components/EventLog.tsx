import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain, MessageSquare, Terminal, AlertTriangle, Info,
  Wrench, ChevronDown, ChevronRight, Compass, Cpu, FlaskConical,
  Eye, Pencil, Search as SearchIcon, Lightbulb, Coins, Clock, BookMarked
} from 'lucide-react'
import type { ProjectEvent, Stage } from '../types'

type ParsedStage = {
  index: number
  title: string
  description: string
}

type ParsedCriterion = {
  criteria: string
}

type ParsedCriteriaUpdate = {
  index: number | null
  met: boolean
  evidence: string
}

type StructuredPayload = {
  stages: ParsedStage[]
  successCriteria: ParsedCriterion[]
  criteriaUpdates: ParsedCriteriaUpdate[]
}

/* ── Agent colour & icon mapping ─────────────────────────────── */

const AGENT_STYLES: Record<string, { color: string; bg: string; border: string; icon: typeof Cpu }> = {
  'plan_maker_agent':    { color: 'text-indigo-700', bg: 'bg-indigo-50',  border: 'border-indigo-100', icon: Pencil },
  'plan_reviewer_agent': { color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-100', icon: Eye },
  'code_agent':          { color: 'text-cyan-700',   bg: 'bg-cyan-50',    border: 'border-cyan-100',   icon: Terminal },
  'analysis_agent':      { color: 'text-emerald-700',bg: 'bg-emerald-50', border: 'border-emerald-100',icon: FlaskConical },
  'review_agent':        { color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-100',  icon: Eye },
  'research_agent':      { color: 'text-rose-700',   bg: 'bg-rose-50',    border: 'border-rose-100',   icon: SearchIcon },
  'discovery':           { color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100', icon: Compass },
  'hypothesis_agent':    { color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-100',  icon: Lightbulb },
}

function getAgentStyle(author: string) {
  const key = author.toLowerCase().replace(/\s+/g, '_')
  return AGENT_STYLES[key] || { color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-100', icon: Cpu }
}

function prettyAgentName(author: string): string {
  return author
    .replace(/_/g, ' ')
    .replace(/\bagent\b/gi, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim() || author
}

function prettyToolName(toolName: string): string {
  if (!toolName) return 'Tool'
  return toolName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
}

type TodoItem = {
  activeForm?: string
  content?: string
  status?: string
}

function formatTodoWriteDetails(args: Record<string, unknown>): string {
  const todosRaw = args.todos
  if (!Array.isArray(todosRaw)) return ''

  const todos = todosRaw.filter((item): item is TodoItem => typeof item === 'object' && item !== null)
  if (todos.length === 0) return ''

  const statusCounts = todos.reduce<Record<string, number>>((acc, t) => {
    const key = typeof t.status === 'string' && t.status.trim() ? t.status.trim() : 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const statusSummary = Object.entries(statusCounts)
    .map(([status, count]) => `${count} ${status.replace(/_/g, ' ')}`)
    .join(', ')

  const preview = todos
    .slice(0, 4)
    .map((t, idx) => {
      const text = typeof t.activeForm === 'string' && t.activeForm.trim()
        ? t.activeForm.trim()
        : (typeof t.content === 'string' ? t.content.trim() : '')
      const status = typeof t.status === 'string' && t.status.trim() ? ` [${t.status}]` : ''
      return text ? `${idx + 1}. ${text}${status}` : ''
    })
    .filter(Boolean)

  const more = todos.length > preview.length ? `\n+${todos.length - preview.length} more` : ''
  return `Updated todo list (${todos.length} items${statusSummary ? `: ${statusSummary}` : ''})\n${preview.join('\n')}${more}`
}

function formatToolCallDetails(event: ProjectEvent): string {
  const args = event.metadata?.arguments || {}

  if (event.content === 'Bash') {
    const command = typeof args.command === 'string' ? args.command : ''
    const description = typeof args.description === 'string' ? args.description : ''
    const cwd = typeof args.cwd === 'string' ? args.cwd : ''

    const parts = []
    if (description) parts.push(description)
    if (command) parts.push(`$ ${command}`)
    if (cwd) parts.push(`cwd: ${cwd}`)

    return parts.join(' • ')
  }

  if (event.content === 'Read') {
    const filePath = typeof args.file_path === 'string' ? args.file_path : ''
    return filePath || ''
  }

  if (event.content === 'Write') {
    const filePath = typeof args.file_path === 'string' ? args.file_path : ''
    return filePath || ''
  }

  if (event.content === 'TodoWrite') {
    return formatTodoWriteDetails(args)
  }

  const entries = Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .filter(Boolean)

  return entries.join(' • ')
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

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function LiveDuration({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const update = () => setElapsed(Math.max(0, (Date.now() - start) / 1000))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <>{formatDuration(elapsed)}</>
}

function toTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // Supports event timestamps emitted as HH:MM:SS(.mmm)
  const timeOnlyMatch = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (timeOnlyMatch) {
    const hour = Number(timeOnlyMatch[1])
    const minute = Number(timeOnlyMatch[2])
    const second = Number(timeOnlyMatch[3])
    const millisRaw = timeOnlyMatch[4] ?? '0'
    const millis = Number(millisRaw.padEnd(3, '0'))

    if (
      Number.isFinite(hour) && Number.isFinite(minute) && Number.isFinite(second) && Number.isFinite(millis)
      && hour >= 0 && hour <= 23
      && minute >= 0 && minute <= 59
      && second >= 0 && second <= 59
      && millis >= 0 && millis <= 999
    ) {
      return ((hour * 60 + minute) * 60 + second) * 1000 + millis
    }
  }

  const time = new Date(trimmed).getTime()
  return Number.isFinite(time) ? time : null
}

function inferUsageStage(event: ProjectEvent): 'planning' | 'review' | 'coding' | null {
  const metaStage = String(
    event.metadata?.stage
    || event.metadata?.role
    || event.metadata?.llm_stage
    || '',
  ).toLowerCase()
  const author = String(event.author || '').toLowerCase()
  const model = String(event.metadata?.model || event.content || '').toLowerCase()

  const reviewHints = ['review', 'reviewer', 'critic']
  const codingHints = ['code', 'coding', 'claude']
  const planningHints = ['plan', 'planning', 'orchestrator']

  const hasAny = (text: string, hints: string[]) => hints.some(h => text.includes(h))

  if (hasAny(metaStage, reviewHints) || hasAny(author, reviewHints)) return 'review'
  if (hasAny(metaStage, codingHints) || hasAny(author, codingHints)) return 'coding'
  if (hasAny(metaStage, planningHints) || hasAny(author, planningHints)) return 'planning'

  if (model.includes('claude-code')) return 'coding'

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseStructuredPayload(content: string): StructuredPayload | null {
  try {
    const parsed: unknown = JSON.parse(content)
    if (!isRecord(parsed)) return null

    const stages = Array.isArray(parsed.stages)
      ? parsed.stages
        .filter(isRecord)
        .map((stage, index) => ({
          index,
          title: readString(stage.title),
          description: readString(stage.description),
        }))
        .filter(stage => stage.title || stage.description)
      : []

    const successCriteria = Array.isArray(parsed.success_criteria)
      ? parsed.success_criteria
        .filter(isRecord)
        .map((criterion) => ({
          criteria: readString(criterion.criteria),
        }))
        .filter(criterion => criterion.criteria)
      : []

    const criteriaUpdates = Array.isArray(parsed.criteria_updates)
      ? parsed.criteria_updates
        .filter(isRecord)
        .map((update) => ({
          index: typeof update.index === 'number' ? update.index : null,
          met: update.met === true,
          evidence: readString(update.evidence),
        }))
        .filter(update => update.index !== null || update.evidence)
      : []

    if (stages.length === 0 && successCriteria.length === 0 && criteriaUpdates.length === 0) {
      return null
    }

    return { stages, successCriteria, criteriaUpdates }
  } catch {
    return null
  }
}

function StageDurationBadge({ stage }: { stage?: Stage }) {
  if (!stage) {
    return <span className="text-xs text-gray-400">Not started</span>
  }

  if (stage.status === 'completed' && typeof stage.duration_seconds === 'number') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <Clock className="h-3 w-3" />
        {formatDuration(stage.duration_seconds)}
      </span>
    )
  }

  if (stage.status === 'running' && stage.started_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
        <Clock className="h-3 w-3" />
        <LiveDuration startedAt={stage.started_at} />
      </span>
    )
  }

  if (typeof stage.duration_seconds === 'number' && stage.duration_seconds > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3 w-3" />
        {formatDuration(stage.duration_seconds)}
      </span>
    )
  }

  if (stage.status === 'failed' && stage.started_at && stage.completed_at) {
    const elapsedSeconds = Math.max(0, (new Date(stage.completed_at).getTime() - new Date(stage.started_at).getTime()) / 1000)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600">
        <Clock className="h-3 w-3" />
        {formatDuration(elapsedSeconds)}
      </span>
    )
  }

  return <span className="text-xs text-gray-400">Pending</span>
}

function StructuredEventContent({ content, stages = [] }: { content: string; stages?: Stage[] }) {
  const payload = parseStructuredPayload(content)

  if (!payload) {
    return <MarkdownContent content={content} />
  }

  const metCount = payload.criteriaUpdates.filter(update => update.met).length
  const stageMap = new Map(stages.map(stage => [stage.index, stage]))

  return (
    <div className="space-y-4 text-sm text-gray-700">
      {payload.stages.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">Stages</span>
            <span className="text-xs text-gray-400">{payload.stages.length} total</span>
          </div>
          <div className="space-y-2">
            {payload.stages.map((stage, index) => (
              <div key={`${stage.title}-${index}`} className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-indigo-700 border border-indigo-200">
                    {index + 1}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-gray-900">{stage.title || `Stage ${index + 1}`}</div>
                      <StageDurationBadge stage={stageMap.get(stage.index)} />
                    </div>
                    {stage.description && (
                      <p className="leading-6 text-gray-600">{stage.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {payload.successCriteria.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">Success Criteria</span>
            <span className="text-xs text-gray-400">{payload.successCriteria.length} checks</span>
          </div>
          <div className="space-y-2">
            {payload.successCriteria.map((criterion, index) => (
              <div key={`${criterion.criteria}-${index}`} className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                <p className="leading-6 text-gray-700">{criterion.criteria}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {payload.criteriaUpdates.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Criteria Review</span>
            <span className="text-xs text-gray-400">{metCount}/{payload.criteriaUpdates.length} met</span>
          </div>
          <div className="space-y-2">
            {payload.criteriaUpdates.map((update, index) => (
              <div key={`${update.index ?? index}-${update.evidence}`} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${update.met ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {update.met ? 'Met' : 'Not Met'}
                  </span>
                  <span className="text-xs font-medium text-gray-500">
                    Criterion {typeof update.index === 'number' ? update.index + 1 : index + 1}
                  </span>
                </div>
                {update.evidence && (
                  <p className="mt-2 leading-6 text-gray-600">{update.evidence}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ── Markdown renderer with Tailwind prose classes ───────────── */

function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={`prose prose-sm max-w-none
        prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5
        prose-h3:text-sm prose-h2:text-[15px] prose-h1:text-base
        prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-1.5
        prose-strong:text-gray-800 prose-strong:font-semibold
        prose-em:text-gray-500
        prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-li:text-gray-600
        prose-ol:my-1.5 prose-ol:pl-4
        prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700
        prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:text-xs prose-pre:p-3 prose-pre:overflow-x-auto
        prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-3 prose-blockquote:text-gray-500 prose-blockquote:italic
        prose-table:text-xs prose-th:text-gray-700 prose-td:text-gray-600
        ${className}`}
    >
      {content}
    </ReactMarkdown>
  )
}

function PreviousStepDelta({ previousTimestamp, currentTimestamp }: { previousTimestamp?: string; currentTimestamp: string }) {
  const currentMs = toTimestampMs(currentTimestamp)
  const previousMs = toTimestampMs(previousTimestamp)

  if (currentMs === null || previousMs === null) return null

  const elapsedSeconds = Math.max(0, (currentMs - previousMs) / 1000)

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
      <Clock className="h-3 w-3" />
      +{formatDuration(elapsedSeconds)}
    </span>
  )
}

/* ── Single event card ────────────────────────────────────────── */

function EventCard({ event, stages, previousUsageTimestamp, previousEventTimestamp }: { event: ProjectEvent; stages?: Stage[]; previousUsageTimestamp?: string; previousEventTimestamp?: string }) {
  const [expanded, setExpanded] = useState(true)
  const isLong = event.content.length > 200
  const agentStyle = getAgentStyle(event.author || '')
  const AgentIcon = agentStyle.icon
  const previousStepDelta = <PreviousStepDelta previousTimestamp={previousEventTimestamp} currentTimestamp={event.timestamp} />

  // Tool calls — compact
  if (event.type === 'tool_call') {
    const detail = formatToolCallDetails(event)
    return (
      <div className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-gray-50/60 text-xs text-gray-500 font-mono animate-fade-in">
        <Terminal className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-cyan-700 font-medium">{prettyToolName(event.content)}</span>
            {previousStepDelta}
          </div>
          {detail && (
            <div className="text-gray-500 mt-0.5 break-all whitespace-pre-wrap">
              {detail}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Errors
  if (event.type === 'error') {
    return (
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-100 animate-fade-in">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Error</span>
            {previousStepDelta}
          </div>
          <p className="text-sm text-red-700 mt-0.5 break-words">{event.content}</p>
        </div>
      </div>
    )
  }

  if (event.type === 'usage') {
    const usage = event.metadata?.usage || {}
    const costUsd = typeof event.metadata?.cost_usd === 'number' ? event.metadata.cost_usd : 0
    const totalCostUsd = typeof event.metadata?.total_cost_usd === 'number' ? event.metadata.total_cost_usd : null
    const model = typeof event.metadata?.model === 'string' ? event.metadata.model : event.content
    const llmCallIndex = typeof event.metadata?.llm_call_index === 'number' ? event.metadata.llm_call_index : null
    const usageStage = inferUsageStage(event)
    const currentUsageMs = toTimestampMs(event.timestamp)
    const previousUsageMs = toTimestampMs(previousUsageTimestamp)
    const elapsedSincePreviousUsage = currentUsageMs !== null && previousUsageMs !== null
      ? Math.max(0, (currentUsageMs - previousUsageMs) / 1000)
      : null

    return (
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 animate-fade-in">
        <Coins className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">LLM Cost</span>
            {previousStepDelta}
            {llmCallIndex !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                Call {llmCallIndex}
              </span>
            )}
            {usageStage && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800 capitalize">
                {usageStage}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-emerald-900 font-medium break-all">{formatUsd(costUsd)}</div>
          <div className="mt-1 text-xs text-emerald-800 break-all">{model || event.author || 'LLM call'}</div>
          <div className="mt-1 text-xs text-emerald-700 flex flex-wrap gap-x-3 gap-y-1">
            <span>prompt: {usage.prompt_tokens ?? 0}</span>
            <span>output: {usage.output_tokens ?? 0}</span>
            {!!usage.cached_input_tokens && <span>cached: {usage.cached_input_tokens}</span>}
            <span>total: {usage.total_tokens ?? 0}</span>
            {totalCostUsd !== null && <span>project total: {formatUsd(totalCostUsd)}</span>}
            {elapsedSincePreviousUsage !== null && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <Clock className="h-3 w-3" />
                since last call: {formatDuration(elapsedSincePreviousUsage)}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Status messages
  if (event.type === 'status') {
    const isResume = event.metadata?.phase === 'resume'
    const checkpointFound = event.metadata?.checkpoint_summary_found === true
    const summaryText = event.metadata?.checkpoint_summary as string | undefined
    const pendingEvents = event.metadata?.checkpoint_events_after_summary as number | undefined

    if (isResume && checkpointFound && summaryText) {
      return (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <BookMarked className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex-1">Checkpoint Loaded</span>
            {typeof pendingEvents === 'number' && (
              <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                +{pendingEvents} event{pendingEvents !== 1 ? 's' : ''} since last summary
              </span>
            )}
            {previousStepDelta}
          </div>
          <p className="text-xs text-amber-800 leading-snug pl-5 line-clamp-3">{summaryText}</p>
                {Array.isArray(event.metadata?.checkpoint_findings) && event.metadata.checkpoint_findings.length > 0 && (
                  <div className="mt-2 pl-5 border-l-2 border-amber-300">
                    <p className="text-xs font-semibold text-amber-900 mb-1">Key findings:</p>
                    <ul className="text-xs text-amber-800 space-y-0.5">
                      {event.metadata.checkpoint_findings.slice(0, 3).map((finding: string, idx: number) => (
                        <li key={idx}>• {finding.slice(0, 100)}...</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(event.metadata?.checkpoint_files) && event.metadata.checkpoint_files.length > 0 && (
                  <div className="mt-2 pl-5 border-l-2 border-amber-300">
                    <p className="text-xs font-semibold text-amber-900 mb-1">Files generated:</p>
                    <ul className="text-xs text-amber-800 space-y-0.5">
                      {event.metadata.checkpoint_files.slice(0, 3).map((file: any, idx: number) => (
                        <li key={idx}>📄 <code className="text-amber-700">{file.path}</code> {file.purpose && `(${file.purpose})`}</li>
                      ))}
                    </ul>
                  </div>
                )}
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/60 animate-fade-in">
        <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-700 flex-1">{event.content}</span>
        {previousStepDelta}
      </div>
    )
  }

  // Discovery events
  if (event.type.startsWith('discovery_')) {
    return (
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${agentStyle.bg} border ${agentStyle.border} animate-fade-in`}>
        <Compass className={`w-4 h-4 ${agentStyle.color} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className="mb-2 flex items-center gap-2 flex-wrap">
            {previousStepDelta}
          </div>
          <MarkdownContent content={event.content} className="text-sm" />
        </div>
      </div>
    )
  }

  // Thought messages — collapsible, muted
  if (event.is_thought) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-purple-50/60 transition-colors w-full text-left"
        >
          <Brain className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <span className="text-xs text-purple-400 italic flex-1 truncate">{event.content.slice(0, 80)}...</span>
          {previousStepDelta}
          {expanded ? <ChevronDown className="w-3 h-3 text-purple-300" /> : <ChevronRight className="w-3 h-3 text-purple-300" />}
        </button>
        {expanded && (
          <div className="ml-8 mt-1 px-3 py-2 rounded-lg bg-purple-50/40 border border-purple-100/50">
            <MarkdownContent content={event.content} className="text-xs text-purple-600/70 italic" />
          </div>
        )}
      </div>
    )
  }

  // Main agent messages — rich rendering
  return (
    <div className={`rounded-xl border ${agentStyle.border} overflow-hidden animate-fade-in`}>
      {/* Agent header */}
      <button
        onClick={() => isLong && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 ${agentStyle.bg} ${isLong ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
      >
        <div className={`w-6 h-6 rounded-lg ${agentStyle.bg} border ${agentStyle.border} flex items-center justify-center`}>
          <AgentIcon className={`w-3.5 h-3.5 ${agentStyle.color}`} />
        </div>
        <span className={`text-xs font-bold ${agentStyle.color} uppercase tracking-wider flex-1 text-left`}>
          {prettyAgentName(event.author || 'System')}
        </span>
        {previousStepDelta}
        {isLong && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {(expanded || !isLong) && (
        <div className="px-4 py-3 bg-white">
          <StructuredEventContent content={event.content} stages={stages} />
        </div>
      )}
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────── */

export default function EventLog({ events, stages = [] }: { events: ProjectEvent[]; stages?: Stage[] }) {
  // Filter tool_results (they are verbose and not useful to the user)
  const filtered = events.filter(e => e.type !== 'tool_result')
  const previousUsageTimestampById = new Map<number, string>()
  const previousEventTimestampById = new Map<number, string>()
  let lastUsageTimestamp: string | null = null
  let lastEventTimestamp: string | null = null

  for (const event of filtered) {
    if (lastEventTimestamp) {
      previousEventTimestampById.set(event.id, lastEventTimestamp)
    }
    lastEventTimestamp = event.timestamp

    if (event.type !== 'usage') continue
    if (lastUsageTimestamp) {
      previousUsageTimestampById.set(event.id, lastUsageTimestamp)
    }
    lastUsageTimestamp = event.timestamp
  }

  if (filtered.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-8 text-center">
        <Cpu className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Waiting for events...
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
      {filtered.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          stages={stages}
          previousUsageTimestamp={previousUsageTimestampById.get(event.id)}
          previousEventTimestamp={previousEventTimestampById.get(event.id)}
        />
      ))}
    </div>
  )
}
