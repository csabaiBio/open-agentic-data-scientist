import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, Loader2, Clock, Timer, AlertCircle } from 'lucide-react'
import type { Stage } from '../types'

function formatTime(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const update = () => setElapsed(Math.max(0, (Date.now() - start) / 1000))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return (
    <span className="tabular-nums text-blue-600 font-medium">{formatTime(elapsed)}</span>
  )
}

interface StageProgressProps {
  stages: Stage[]
  projectStartedAt?: string | null
  isRunning?: boolean
}

export default function StageProgress({ stages, projectStartedAt, isRunning = false }: StageProgressProps) {
  const [now, setNow] = useState(Date.now())

  // Tick every second for ETA calculations
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isRunning])

  if (stages.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-4 text-center">
        {isRunning ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            <span>Generating plan...</span>
          </div>
        ) : (
          'Stages will appear once the plan is generated...'
        )}
      </div>
    )
  }

  const total = stages.length
  const completed = stages.filter(s => s.status === 'completed').length
  const running = stages.find(s => s.status === 'running')
  const progressPct = total > 0 ? (completed / total) * 100 : 0

  // ETA calculation: average completed stage duration → estimate remaining
  const completedDurations = stages
    .filter(s => s.duration_seconds && s.duration_seconds > 0)
    .map(s => s.duration_seconds!)
  const avgStageDuration = completedDurations.length > 0
    ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
    : 0
  const remainingStages = total - completed - (running ? 1 : 0)

  // For the running stage, estimate how far along it is
  let runningElapsed = 0
  if (running?.started_at) {
    runningElapsed = Math.max(0, (now - new Date(running.started_at).getTime()) / 1000)
  }
  const runningRemaining = avgStageDuration > 0
    ? Math.max(0, avgStageDuration - runningElapsed)
    : 0
  const totalEta = avgStageDuration > 0
    ? runningRemaining + remainingStages * avgStageDuration
    : 0

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Progress
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-700">
              {completed}/{total} stages
            </span>
            {isRunning && totalEta > 0 && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                ~{formatTime(totalEta)} left
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isRunning ? 'bg-gradient-to-r from-blue-500 to-blue-400' : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
            }`}
            style={{ width: `${Math.max(progressPct, isRunning ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {/* Stage timeline */}
      <div className="relative">
        {stages.map((stage, i) => {
          const isStageRunning = stage.status === 'running'
          const isStageCompleted = stage.status === 'completed'
          const isStageFailed = stage.status === 'failed'
          const isStagePending = stage.status === 'pending'
          const isLast = i === stages.length - 1

          return (
            <div key={i} className="relative flex gap-3">
              {/* Vertical timeline connector */}
              <div className="flex flex-col items-center">
                {/* Icon */}
                <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-500 ${
                  isStageRunning
                    ? 'border-blue-400 bg-blue-50 shadow-sm shadow-blue-200'
                    : isStageCompleted
                    ? 'border-emerald-400 bg-emerald-50'
                    : isStageFailed
                    ? 'border-red-400 bg-red-50'
                    : 'border-gray-200 bg-white'
                }`}>
                  {isStageRunning ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  ) : isStageCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : isStageFailed ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-gray-300" />
                  )}
                </div>
                {/* Connector line */}
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[16px] transition-colors duration-500 ${
                    isStageCompleted ? 'bg-emerald-300' :
                    isStageRunning ? 'bg-gradient-to-b from-blue-300 to-gray-200' :
                    'bg-gray-200'
                  }`} />
                )}
              </div>

              {/* Stage content */}
              <div className={`flex-1 min-w-0 pb-4 transition-all duration-300 ${
                isStagePending ? 'opacity-40' : ''
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isStageRunning ? 'text-blue-600' :
                    isStageCompleted ? 'text-emerald-600' :
                    isStageFailed ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    Stage {stage.index + 1}
                  </span>
                  {/* Duration or live timer */}
                  {isStageCompleted && stage.duration_seconds != null && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTime(stage.duration_seconds)}
                    </span>
                  )}
                  {isStageRunning && stage.started_at && (
                    <span className="text-[10px] flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-blue-400" />
                      <LiveTimer startedAt={stage.started_at} />
                    </span>
                  )}
                </div>
                <span className={`text-sm leading-tight ${
                  isStageRunning ? 'text-gray-900 font-semibold' :
                  isStageCompleted ? 'text-gray-700 font-medium' :
                  'text-gray-400'
                }`}>
                  {stage.title}
                </span>
                {/* Running stage: animated progress indicator */}
                {isStageRunning && (
                  <div className="mt-2 h-1 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: avgStageDuration > 0
                          ? `${Math.min(95, (runningElapsed / avgStageDuration) * 100)}%`
                          : '30%',
                        animation: avgStageDuration === 0 ? 'pulse 2s ease-in-out infinite' : undefined,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
