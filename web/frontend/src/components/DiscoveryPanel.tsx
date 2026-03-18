import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Compass, BookOpen, FlaskConical, Lightbulb, Database,
  ChevronDown, ChevronRight, ExternalLink, FileText, Loader2,
  Play, Pencil, Check
} from 'lucide-react'
import type { DiscoveryResult, ProjectEvent } from '../types'

interface Props {
  discovery: DiscoveryResult | null
  discoveryPhase: string | null
  events: ProjectEvent[]
  analysisQuery: string | null
  isAwaitingConfirmation: boolean
  onConfirm: (analysisQuery: string) => void
}

const PHASE_LABELS: Record<string, { label: string; icon: typeof Compass }> = {
  searching: { label: 'Searching PubMed...', icon: Compass },
  no_results: { label: 'No papers found — using AI reasoning', icon: Compass },
  papers_found: { label: 'Papers found', icon: BookOpen },
  synthesizing: { label: 'Synthesizing research...', icon: FlaskConical },
  synthesis_complete: { label: 'Synthesis complete', icon: FlaskConical },
  hypothesis: { label: 'Formulating hypothesis...', icon: Lightbulb },
  hypothesis_complete: { label: 'Hypothesis ready', icon: Lightbulb },
  formulating: { label: 'Generating research question...', icon: FileText },
  complete: { label: 'Research question ready', icon: FileText },
  done: { label: 'Discovery complete', icon: Compass },
  awaiting_confirmation: { label: 'Awaiting your review', icon: Compass },
  analysis_start: { label: 'Starting automated analysis...', icon: FlaskConical },
}

function DiscoveryPhaseIndicator({ phase }: { phase: string | null }) {
  if (!phase) return null

  const phases = ['searching', 'no_results', 'papers_found', 'synthesizing', 'synthesis_complete', 'hypothesis', 'hypothesis_complete', 'formulating', 'complete', 'done', 'awaiting_confirmation']
  const currentIdx = phases.indexOf(phase)
  const noResults = phase === 'no_results' || (currentIdx > phases.indexOf('no_results') && currentIdx <= phases.indexOf('papers_found'))
  const majorSteps = [
    { key: 'searching', label: noResults ? 'No Papers Found' : 'Fetch Papers' },
    { key: 'synthesizing', label: noResults ? 'AI Reasoning' : 'Synthesize' },
    { key: 'hypothesis', label: 'Hypothesis' },
    { key: 'formulating', label: 'Research Plan' },
    { key: 'done', label: 'Complete' },
  ]

  return (
    <div className="flex items-center gap-1 mb-5">
      {majorSteps.map((step, i) => {
        const stepIdx = phases.indexOf(step.key)
        const isActive = currentIdx >= stepIdx && currentIdx < (i < majorSteps.length - 1 ? phases.indexOf(majorSteps[i + 1].key) : 999)
        const isDone = currentIdx > stepIdx && !isActive
        const isPast = currentIdx >= stepIdx

        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200'
                : isDone || isPast
                ? 'bg-violet-50 text-violet-500'
                : 'bg-gray-50 text-gray-400'
            }`}>
              {isActive && phase !== 'done' && <Loader2 className="w-3 h-3 animate-spin" />}
              {step.label}
            </div>
            {i < majorSteps.length - 1 && (
              <div className={`flex-1 h-px ${isPast ? 'bg-violet-300' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function PaperCard({ paper, index }: { paper: any; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors text-left"
      >
        <span className="text-xs font-bold text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-800 leading-snug">{paper.title}</h4>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>{paper.authors?.[0]}{paper.authors?.length > 1 ? ' et al.' : ''}</span>
            <span>&middot;</span>
            <span>{paper.journal}</span>
            <span>&middot;</span>
            <span>{paper.pub_date}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-violet-50 text-gray-400 hover:text-violet-600"
              title="View on DOI"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>
      {expanded && paper.abstract && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/30">
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{paper.abstract}</p>
          {paper.keywords?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {paper.keywords.slice(0, 8).map((kw: string, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MarkdownSection({ title, icon: Icon, content, color = 'violet' }: {
  title: string
  icon: typeof Compass
  content: string
  color?: string
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (!content) return null

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50/50 transition-colors"
      >
        <Icon className={`w-4 h-4 text-${color}-500`} />
        <span className="text-sm font-semibold text-gray-700 flex-1 text-left">{title}</span>
        {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {!collapsed && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DiscoveryPanel({
  discovery, discoveryPhase, events,
  analysisQuery, isAwaitingConfirmation, onConfirm,
}: Props) {
  const [editedQuery, setEditedQuery] = useState(analysisQuery || '')
  const [isEditing, setIsEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Sync editedQuery when analysisQuery changes (e.g. after reload)
  useEffect(() => {
    if (analysisQuery) setEditedQuery(analysisQuery)
  }, [analysisQuery])

  // Show live events during discovery
  const discoveryEvents = events.filter(e => e.author === 'discovery')
  const isInProgress = discoveryPhase && discoveryPhase !== 'done' && !isAwaitingConfirmation

  const handleConfirm = async () => {
    if (!editedQuery.trim()) return
    setConfirming(true)
    try {
      await onConfirm(editedQuery.trim())
    } finally {
      setConfirming(false)
    }
  }

  // During discovery, show live progress
  if (!discovery && isInProgress) {
    return (
      <div className="space-y-4">
        <DiscoveryPhaseIndicator phase={discoveryPhase} />
        <div className="space-y-2">
          {discoveryEvents.map((event) => (
            <div
              key={event.id}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm animate-fade-in ${
                event.type === 'discovery_paper'
                  ? 'bg-violet-50/50'
                  : event.type === 'discovery_phase'
                  ? 'bg-blue-50/50'
                  : ''
              }`}
            >
              {event.type === 'discovery_paper' && <BookOpen className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />}
              {event.type === 'discovery_phase' && <Compass className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />}
              {event.type === 'discovery_synthesis' && <FlaskConical className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />}
              {event.type === 'discovery_hypothesis' && <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />}
              <p className="text-gray-600 leading-relaxed">
                {event.content.length > 300 ? event.content.slice(0, 300) + '...' : event.content}
              </p>
            </div>
          ))}
          {isInProgress && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-violet-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              {PHASE_LABELS[discoveryPhase]?.label || 'Processing...'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // After discovery is complete, show structured results
  if (!discovery) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Compass className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No discovery results yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <DiscoveryPhaseIndicator phase={discoveryPhase || 'done'} />

      {/* Papers */}
      {discovery.papers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-500" />
            Fetched Papers ({discovery.papers.length})
          </h3>
          <div className="space-y-1">
            {discovery.papers.map((paper, i) => (
              <PaperCard key={paper.pmid || i} paper={paper} index={i} />
            ))}
          </div>
        </div>
      )}

      {discovery.papers.length === 0 && (
        <div className="border border-amber-200 rounded-xl bg-amber-50/50 px-4 py-3">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <Compass className="w-4 h-4" />
            No papers found on PubMed within the specified time window. The synthesis below is based on AI reasoning.
          </p>
        </div>
      )}

      {/* Synthesis */}
      <MarkdownSection
        title="Research Synthesis"
        icon={FlaskConical}
        content={discovery.synthesis}
        color="emerald"
      />

      {/* Hypothesis */}
      <MarkdownSection
        title="Hypothesis & Analysis Plan"
        icon={Lightbulb}
        content={discovery.hypothesis}
        color="amber"
      />

      {/* ── Research Question (editable when awaiting confirmation) ── */}
      {(analysisQuery || discovery.research_question) && (
        <div className={`rounded-xl overflow-hidden ${
          isAwaitingConfirmation
            ? 'border-2 border-violet-400 ring-2 ring-violet-100 bg-violet-50/40'
            : 'border-2 border-violet-200 bg-violet-50/30'
        }`}>
          <div className="flex items-center gap-2.5 px-4 py-3 bg-violet-50">
            <Database className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-semibold text-violet-800 flex-1">
              {isAwaitingConfirmation ? 'Review Research Question' : 'Generated Research Question'}
            </span>
            {isAwaitingConfirmation && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            )}
            {isAwaitingConfirmation && isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Check className="w-3 h-3" />
                Done editing
              </button>
            )}
          </div>

          <div className="px-5 py-4">
            {isEditing && isAwaitingConfirmation ? (
              <textarea
                value={editedQuery}
                onChange={(e) => setEditedQuery(e.target.value)}
                rows={12}
                className="w-full text-sm text-gray-700 leading-relaxed border border-violet-200 rounded-lg p-3 focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none resize-y font-mono"
                placeholder="Edit the research question..."
              />
            ) : (
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {(isAwaitingConfirmation ? editedQuery : analysisQuery || discovery.research_question) || ''}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Confirmation bar */}
          {isAwaitingConfirmation && (
            <div className="border-t border-violet-200 px-5 py-4 bg-gradient-to-r from-violet-50 to-indigo-50">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-violet-600">
                  Review the research question above. Edit if needed, then confirm to start the automated analysis.
                </p>
                <button
                  onClick={handleConfirm}
                  disabled={confirming || !editedQuery.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex-shrink-0"
                >
                  {confirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {confirming ? 'Starting...' : 'Confirm & Start Analysis'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
