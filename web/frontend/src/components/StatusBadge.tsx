import { CheckCircle2, Circle, Loader2, XCircle, StopCircle, MessageSquare } from 'lucide-react'
import type { ProjectStatus } from '../types'

const config: Record<ProjectStatus, { icon: typeof Circle; label: string; className: string }> = {
  pending: { icon: Circle, label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  running: { icon: Loader2, label: 'Running', className: 'bg-blue-50 text-blue-600' },
  completed: { icon: CheckCircle2, label: 'Completed', className: 'bg-emerald-50 text-emerald-600' },
  failed: { icon: XCircle, label: 'Failed', className: 'bg-red-50 text-red-600' },
  stopped: { icon: StopCircle, label: 'Stopped', className: 'bg-amber-50 text-amber-600' },
  awaiting_confirmation: { icon: MessageSquare, label: 'Review Required', className: 'bg-violet-50 text-violet-600' },
}

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = config[status]
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.className}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {c.label}
    </span>
  )
}
