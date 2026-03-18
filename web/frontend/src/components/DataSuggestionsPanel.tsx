import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Cpu, FlaskConical, Loader2, Download, RefreshCw } from 'lucide-react'
import { generateDataSuggestions } from '../api'

interface Props {
  projectId: string
  type: 'in_silico' | 'experimental'
  isCompleted: boolean
  initialContent?: string | null
}

const CONFIG = {
  in_silico: {
    title: 'In-Silico Data Recommendations',
    description: 'Computational datasets, simulations, and public database queries that would strengthen and extend the analysis.',
    icon: Cpu,
    emptyIcon: Cpu,
    buttonLabel: 'Generate In-Silico Suggestions',
    generatingLabel: 'Analyzing gaps & generating suggestions...',
    bgLight: 'bg-cyan-50',
    textMain: 'text-cyan-700',
    textMuted: 'text-cyan-500',
    textFaint: 'text-cyan-300',
    borderLight: 'border-cyan-100',
    btnBg: 'bg-cyan-600 hover:bg-cyan-700',
    spinnerColor: 'text-cyan-500',
  },
  experimental: {
    title: 'Experimental Data Recommendations',
    description: 'Wet-lab experiments, validation assays, and new sample collections that would confirm and expand the findings.',
    icon: FlaskConical,
    emptyIcon: FlaskConical,
    buttonLabel: 'Generate Experimental Suggestions',
    generatingLabel: 'Analyzing results & generating protocols...',
    bgLight: 'bg-emerald-50',
    textMain: 'text-emerald-700',
    textMuted: 'text-emerald-500',
    textFaint: 'text-emerald-300',
    borderLight: 'border-emerald-100',
    btnBg: 'bg-emerald-600 hover:bg-emerald-700',
    spinnerColor: 'text-emerald-500',
  },
} as const

export default function DataSuggestionsPanel({ projectId, type, isCompleted, initialContent }: Props) {
  const [content, setContent] = useState<string | null>(initialContent ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cfg = CONFIG[type]
  const Icon = cfg.icon
  const EmptyIcon = cfg.emptyIcon

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateDataSuggestions(projectId, type)
      setContent(result.content)
    } catch (e: any) {
      setError(e.message || 'Failed to generate suggestions')
    } finally {
      setLoading(false)
    }
  }

  // Not completed yet
  if (!isCompleted) {
    return (
      <div className="text-center py-16">
        <EmptyIcon className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Complete the analysis first to generate data suggestions</p>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className={`w-16 h-16 rounded-2xl ${cfg.bgLight} flex items-center justify-center`}>
            <Loader2 className={`w-8 h-8 ${cfg.spinnerColor} animate-spin`} />
          </div>
        </div>
        <p className={`text-sm font-medium ${cfg.textMain}`}>{cfg.generatingLabel}</p>
        <p className="text-xs text-gray-400 mt-1">This may take a minute...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl inline-block mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
        <br />
        <button
          onClick={handleGenerate}
          className={`inline-flex items-center gap-2 px-5 py-2.5 ${cfg.btnBg} text-white rounded-xl text-sm font-medium transition-colors shadow-sm`}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  // Content loaded — render markdown
  if (content) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-sm font-medium ${cfg.textMain}`}>
            <Icon className="w-4 h-4" />
            {cfg.title}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              title="Regenerate"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
            <a
              href={`data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`}
              download={`${type}_data_suggestions.md`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
          </div>
        </div>
        <div className={`border ${cfg.borderLight} rounded-xl overflow-hidden`}>
          <div className="px-5 py-4 bg-white">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              className="prose prose-sm max-w-none
                prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-p:text-gray-600 prose-p:leading-relaxed prose-p:my-2
                prose-strong:text-gray-800 prose-strong:font-semibold
                prose-em:text-gray-500
                prose-ul:my-2 prose-ul:pl-5 prose-li:my-1 prose-li:text-gray-600
                prose-ol:my-2 prose-ol:pl-5
                prose-code:text-xs prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-gray-700
                prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:text-xs prose-pre:p-3 prose-pre:overflow-x-auto
                prose-blockquote:border-l-2 prose-blockquote:border-gray-300 prose-blockquote:pl-3 prose-blockquote:text-gray-500 prose-blockquote:italic
                prose-table:text-xs prose-th:text-gray-700 prose-td:text-gray-600 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2
                prose-hr:my-6 prose-hr:border-gray-200"
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }

  // Empty state — prompt to generate
  return (
    <div className="text-center py-16 animate-fade-in">
      <div className={`w-16 h-16 rounded-2xl ${cfg.bgLight} flex items-center justify-center mx-auto mb-4`}>
        <EmptyIcon className={`w-8 h-8 ${cfg.textFaint}`} />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{cfg.title}</h3>
      <p className="text-xs text-gray-400 max-w-md mx-auto mb-5">{cfg.description}</p>
      <button
        onClick={handleGenerate}
        className={`inline-flex items-center gap-2 px-5 py-2.5 ${cfg.btnBg} text-white rounded-xl text-sm font-medium transition-colors shadow-sm`}
      >
        <Icon className="w-4 h-4" />
        {cfg.buttonLabel}
      </button>
    </div>
  )
}
