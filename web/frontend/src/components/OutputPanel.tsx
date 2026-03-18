import { useState, useEffect } from 'react'
import { FileText, Database, Code, Download, ChevronDown, ChevronRight } from 'lucide-react'
import type { GeneratedFile } from '../types'
import { getFileUrl } from '../api'

interface Props {
  projectId: string
  files: GeneratedFile[]
}

function FileIcon({ type }: { type: string }) {
  switch (type) {
    case 'report': return <FileText className="w-4 h-4 text-orange-500" />
    case 'data': return <Database className="w-4 h-4 text-green-500" />
    case 'code': return <Code className="w-4 h-4 text-violet-500" />
    default: return <FileText className="w-4 h-4 text-gray-400" />
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FilePreview({ projectId, file }: { projectId: string; file: GeneratedFile }) {
  const [content, setContent] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (expanded && content === null && (file.type === 'report' || file.type === 'data' || file.type === 'code')) {
      fetch(getFileUrl(projectId, file.path))
        .then(res => res.text())
        .then(setContent)
        .catch(() => setContent('(failed to load)'))
    }
  }, [expanded, projectId, file.path, file.type, content])

  const isPreviewable = ['report', 'data', 'code'].includes(file.type)

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={() => isPreviewable && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        {isPreviewable ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <div className="w-3.5" />
        )}
        <FileIcon type={file.type} />
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">{file.name}</span>
        <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
        <a
          href={getFileUrl(projectId, file.path)}
          download={file.name}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-gray-200 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-gray-400" />
        </a>
      </button>
      {expanded && content !== null && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 max-h-64 overflow-auto">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
            {content.length > 3000 ? content.slice(0, 3000) + '\n\n... (truncated)' : content}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function OutputPanel({ projectId, files }: Props) {
  const nonFigures = files.filter(f => f.type !== 'figure')

  if (nonFigures.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-4 text-center">
        No output files yet
      </div>
    )
  }

  const grouped: Record<string, GeneratedFile[]> = {}
  for (const f of nonFigures) {
    const key = f.type
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(f)
  }

  const order = ['report', 'data', 'code', 'other']

  return (
    <div className="space-y-4">
      {order.map(type => {
        const group = grouped[type]
        if (!group) return null
        return (
          <div key={type}>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {type === 'report' ? 'Reports' : type === 'data' ? 'Data Files' : type === 'code' ? 'Code' : 'Other'}
            </h4>
            <div className="space-y-1">
              {group.map(f => (
                <FilePreview key={f.path} projectId={projectId} file={f} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
