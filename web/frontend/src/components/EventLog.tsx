import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Brain, MessageSquare, Terminal, AlertTriangle, Info,
  Wrench, ChevronDown, ChevronRight, Compass, Cpu, FlaskConical,
  Eye, Pencil, Search as SearchIcon, Lightbulb
} from 'lucide-react'
import type { ProjectEvent } from '../types'

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

  const entries = Object.entries(args)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .filter(Boolean)

  return entries.join(' • ')
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

/* ── Single event card ────────────────────────────────────────── */

function EventCard({ event }: { event: ProjectEvent }) {
  const [expanded, setExpanded] = useState(true)
  const isLong = event.content.length > 200
  const agentStyle = getAgentStyle(event.author || '')
  const AgentIcon = agentStyle.icon

  // Tool calls — compact
  if (event.type === 'tool_call') {
    const detail = formatToolCallDetails(event)
    return (
      <div className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-gray-50/60 text-xs text-gray-500 font-mono animate-fade-in">
        <Terminal className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="text-cyan-700 font-medium">{event.content}</span>
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
          <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Error</span>
          <p className="text-sm text-red-700 mt-0.5 break-words">{event.content}</p>
        </div>
      </div>
    )
  }

  // Status messages
  if (event.type === 'status') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/60 animate-fade-in">
        <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-sm font-medium text-blue-700">{event.content}</span>
      </div>
    )
  }

  // Discovery events
  if (event.type.startsWith('discovery_')) {
    return (
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${agentStyle.bg} border ${agentStyle.border} animate-fade-in`}>
        <Compass className={`w-4 h-4 ${agentStyle.color} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
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
        {isLong && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {(expanded || !isLong) && (
        <div className="px-4 py-3 bg-white">
          <MarkdownContent content={event.content} />
        </div>
      )}
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────── */

export default function EventLog({ events }: { events: ProjectEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  // Filter tool_results (they are verbose and not useful to the user)
  const filtered = events.filter(e => e.type !== 'tool_result')

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
        <EventCard key={event.id} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
