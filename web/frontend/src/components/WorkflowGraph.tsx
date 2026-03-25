import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loader2, Play } from 'lucide-react'
import { getFileUrl } from '../api'
import type { ProjectEvent, Stage, GeneratedFile } from '../types'

// ── Story Data Types ────────────────────────────────────────────

type StoryKind =
  | 'stage'        // Stage banner
  | 'implement'    // Coding phase summary
  | 'tool_group'   // Group of tool calls
  | 'figure'       // Figure created
  | 'review'       // Review outcome
  | 'confirm'      // Implementation confirmation
  | 'criteria'     // Criteria check result
  | 'reflect'      // Stage reflection
  | 'error'        // Error
  | 'completion'   // All done
  | 'summary'      // Summary phase

interface StoryNode {
  kind: StoryKind
  title: string
  detail: string
  icon: string
  success?: boolean // true=green, false=red, undefined=neutral
  figures?: string[]       // filenames
  figurePaths?: string[]   // full URL paths for thumbnails
  toolCount?: number
  timestamp?: string
  stageIndex?: number
}

// ── Color Palette ───────────────────────────────────────────────

const PALETTE: Record<StoryKind, { bg: string; border: string; text: string; accent: string }> = {
  stage:      { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', accent: '#c4b5fd' },
  implement:  { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', accent: '#93c5fd' },
  tool_group: { bg: '#fefce8', border: '#eab308', text: '#854d0e', accent: '#fde68a' },
  figure:     { bg: '#ecfdf5', border: '#10b981', text: '#065f46', accent: '#6ee7b7' },
  review:     { bg: '#fdf4ff', border: '#a855f7', text: '#7e22ce', accent: '#d8b4fe' },
  confirm:    { bg: '#f0fdf4', border: '#22c55e', text: '#166534', accent: '#86efac' },
  criteria:   { bg: '#fff7ed', border: '#f97316', text: '#9a3412', accent: '#fdba74' },
  reflect:    { bg: '#f0f9ff', border: '#0ea5e9', text: '#0c4a6e', accent: '#7dd3fc' },
  error:      { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', accent: '#fca5a5' },
  completion: { bg: '#ecfdf5', border: '#059669', text: '#064e3b', accent: '#34d399' },
  summary:    { bg: '#f8fafc', border: '#64748b', text: '#334155', accent: '#94a3b8' },
}

// ── Helpers ──────────────────────────────────────────────────────

function clean(text: string): string {
  return text.replace(/[#*`\n\r\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function truncWords(text: string, max = 8): string {
  const c = clean(text)
  const w = c.split(' ').filter(Boolean)
  return w.length <= max ? w.join(' ') : w.slice(0, max).join(' ') + '…'
}

function extractFigures(content: string): string[] {
  const figs: string[] = []
  const re = /[\w\-]+\.(png|jpg|jpeg|svg|gif)/gi
  let m
  while ((m = re.exec(content)) !== null) {
    const name = m[0]
    if (!figs.includes(name)) figs.push(name)
  }
  return figs
}

// ── Figure-Stage Mapping ────────────────────────────────────────

function mapFiguresToStages(files: GeneratedFile[], projectId: string): Record<number, { names: string[]; paths: string[] }> {
  const map: Record<number, { names: string[]; paths: string[] }> = {}
  const figFiles = files.filter(f => f.type === 'figure' || /\.(png|jpg|jpeg|svg|gif)$/i.test(f.path))

  for (const f of figFiles) {
    const name = f.name || f.path.split('/').pop() || ''
    // Match stageN_ prefix
    const m = name.match(/^stage(\d+)_/i)
    const stageNum = m ? parseInt(m[1]) : (f.stage_index != null ? f.stage_index + 1 : 1)
    if (!map[stageNum]) map[stageNum] = { names: [], paths: [] }
    map[stageNum].names.push(name)
    map[stageNum].paths.push(getFileUrl(projectId, f.path.replace(/\\/g, '/')))
  }
  return map
}

// ── Story Parser ────────────────────────────────────────────────
// Converts raw events into a narrative sequence of story nodes

function parseStory(
  events: ProjectEvent[],
  stages: Stage[],
  figureMap: Record<number, { names: string[]; paths: string[] }>,
): StoryNode[] {

  const story: StoryNode[] = []

  // ── Phase 1: Insert all stages from backend (includes filesystem-reconstructed ones) ──
  const stagesFromEvents = new Set<number>() // track which stages are in events
  const sortedStages = [...stages].sort((a, b) => a.index - b.index)

  // Build a map of which event indices correspond to which stage starts
  const stageEventIndices: Record<number, number> = {}
  for (let ei = 0; ei < events.length; ei++) {
    const e = events[ei]
    const stageMatch = (e.content || '').match(/###\s*Stage\s+(\d+)\s*:/)
    if (stageMatch && e.author === 'stage_orchestrator') {
      stageEventIndices[parseInt(stageMatch[1])] = ei
      stagesFromEvents.add(parseInt(stageMatch[1]))
    }
  }

  // Insert stages that have NO events (reconstructed from filesystem)
  for (const stage of sortedStages) {
    const stageNum = stage.index + 1
    if (!stagesFromEvents.has(stageNum)) {
      const figs = figureMap[stageNum]
      story.push({
        kind: 'stage',
        title: `Stage ${stageNum}`,
        detail: truncWords(stage.title, 6),
        icon: '🎯',
        stageIndex: stage.index,
      })
      // Add figures for this reconstructed stage
      if (figs && figs.names.length > 0) {
        story.push({
          kind: 'figure',
          title: `📊 ${figs.names.length} Figure${figs.names.length > 1 ? 's' : ''} Created`,
          detail: figs.names.slice(0, 3).map(n => n.replace(/^stage\d+_/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')).join(', '),
          icon: '📊',
          figures: figs.names,
          figurePaths: figs.paths,
          success: true,
          stageIndex: stage.index,
        })
      }
    }
  }

  // ── Phase 2: Parse events into story beats ──
  let i = 0
  let currentStageNum = 0
  while (i < events.length) {
    const e = events[i]
    const a = e.author || ''
    const c = e.content || ''
    const t = e.type

    // ── Stage start (from events) ──
    const stageMatch = c.match(/###\s*Stage\s+(\d+)\s*:\s*(.+?)(?:\n|$)/)
    if (stageMatch && a === 'stage_orchestrator') {
      const stageNum = parseInt(stageMatch[1])
      currentStageNum = stageNum
      const title = clean(stageMatch[2]).split('.')[0]
      story.push({
        kind: 'stage',
        title: `Stage ${stageNum}`,
        detail: truncWords(title, 6),
        icon: '🎯',
        timestamp: e.timestamp,
        stageIndex: stageNum - 1,
      })
      i++
      continue
    }

    // ── Coding agent block: gather all consecutive coding events ──
    if (a === 'coding_agent') {
      const startIdx = i
      let toolCalls: string[] = []
      let figures: string[] = []
      let completionMsg = ''
      let hasError = false
      let errorMsg = ''

      while (i < events.length && (events[i].author === 'coding_agent' || (events[i].type === 'tool_result' && i > startIdx && events[i - 1]?.author === 'coding_agent'))) {
        const ev = events[i]
        if (ev.type === 'tool_call') {
          toolCalls.push(ev.content || '')
        }
        if (ev.type === 'tool_result') {
          const rc = ev.content || ''
          figures.push(...extractFigures(rc))
          if (/error|traceback|exception/i.test(rc.slice(0, 150))) {
            hasError = true
            errorMsg = truncWords(rc, 6)
          }
        }
        if (ev.type === 'message' && /complete|✅|summary|accomplished/i.test((ev.content || '').slice(0, 100))) {
          completionMsg = truncWords(ev.content || '', 10)
        }
        i++
      }

      // Summarize what the coding agent did
      const bashCount = toolCalls.filter(t => t === 'Bash').length
      const writeCount = toolCalls.filter(t => t === 'Write' || t === 'Edit').length
      const readCount = toolCalls.filter(t => t === 'Read' || t.includes('read_file')).length

      const actions: string[] = []
      if (bashCount) actions.push(`${bashCount} commands`)
      if (writeCount) actions.push(`${writeCount} file writes`)
      if (readCount) actions.push(`${readCount} file reads`)

      // Implementation summary node
      story.push({
        kind: 'implement',
        title: '🛠 Implementation',
        detail: completionMsg || (actions.length ? actions.join(', ') : `${toolCalls.length} tool calls`),
        icon: '🛠',
        success: !hasError,
        toolCount: toolCalls.length,
        timestamp: events[startIdx].timestamp,
      })

      // Tool breakdown node
      if (toolCalls.length > 0) {
        const toolGroups: Record<string, number> = {}
        toolCalls.forEach(tc => { toolGroups[tc] = (toolGroups[tc] || 0) + 1 })
        const toolSummary = Object.entries(toolGroups)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name} ×${count}`)
          .join(', ')
        story.push({
          kind: 'tool_group',
          title: `${toolCalls.length} Tool Calls`,
          detail: toolSummary,
          icon: '⚙️',
          toolCount: toolCalls.length,
        })
      }

      // Error node if any
      if (hasError) {
        story.push({
          kind: 'error',
          title: 'Error Encountered',
          detail: errorMsg || 'Execution error in tool output',
          icon: '❌',
          success: false,
        })
      }

      // Figure nodes — merge event-detected figures with figureMap
      const stageFigs = figureMap[currentStageNum]
      const allFigNames = [...new Set([...figures, ...(stageFigs?.names || [])])]
      const allFigPaths = stageFigs?.paths || []
      if (allFigNames.length > 0) {
        story.push({
          kind: 'figure',
          title: `📊 ${allFigNames.length} Figure${allFigNames.length > 1 ? 's' : ''} Created`,
          detail: allFigNames.slice(0, 3).map(n => n.replace(/^stage\d+_/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')).join(', '),
          icon: '📊',
          figures: allFigNames,
          figurePaths: allFigPaths,
          success: true,
          stageIndex: currentStageNum - 1,
        })
      }
      continue
    }

    // ── Review agent ──
    if (a === 'review_agent' && t === 'message') {
      // Scan the review content for verdict
      const approved = /approve|pass|✓|✅|excellent|well.done/i.test(c.slice(0, 400))
      const failed = /fail|reject|❌|not.met|insufficient|missing/i.test(c.slice(0, 400))
      const verdict = approved ? 'Approved' : failed ? 'Issues Found' : 'Reviewed'

      // Skip over remaining review_agent events
      while (i + 1 < events.length && events[i + 1].author === 'review_agent') i++

      // Also extract figures found during review
      const reviewFigs = extractFigures(c)

      story.push({
        kind: 'review',
        title: `📋 Review: ${verdict}`,
        detail: truncWords(c.replace(/^.*?---\s*/s, ''), 10) || verdict,
        icon: approved ? '✅' : failed ? '⚠️' : '📋',
        success: approved ? true : failed ? false : undefined,
        figures: reviewFigs.length > 0 ? reviewFigs : undefined,
      })
      i++
      continue
    }

    // ── Review confirmation ──
    if (a === 'implementation_review_confirmation_agent') {
      let exitTrue = false
      let reason = ''
      try {
        const parsed = JSON.parse(c)
        exitTrue = parsed.exit === true
        reason = parsed.reason || ''
      } catch { reason = c }

      story.push({
        kind: 'confirm',
        title: exitTrue ? '✅ Approved & Moving On' : '🔄 Needs More Work',
        detail: truncWords(reason, 10),
        icon: exitTrue ? '✅' : '🔄',
        success: exitTrue,
      })
      i++
      continue
    }

    // ── Criteria checker ──
    if (a === 'success_criteria_checker') {
      // Gather all criteria checker events
      let criteriaContent = c
      while (i + 1 < events.length && events[i + 1].author === 'success_criteria_checker') {
        i++
        criteriaContent += ' ' + (events[i].content || '')
      }

      // Count met/unmet
      const metMatches = criteriaContent.match(/"met":\s*true/g)
      const unmetMatches = criteriaContent.match(/"met":\s*false/g)
      const metCount = metMatches?.length || 0
      const totalCount = metCount + (unmetMatches?.length || 0)

      story.push({
        kind: 'criteria',
        title: `📊 Criteria: ${metCount}/${totalCount || '?'} Met`,
        detail: totalCount ? `${metCount} of ${totalCount} success criteria satisfied` : truncWords(criteriaContent, 8),
        icon: metCount === totalCount && totalCount > 0 ? '🏆' : '📊',
        success: metCount === totalCount && totalCount > 0,
      })
      i++
      continue
    }

    // ── Stage reflector ──
    if (a === 'stage_reflector') {
      let reflectContent = c
      while (i + 1 < events.length && events[i + 1].author === 'stage_reflector') {
        i++
        reflectContent += ' ' + (events[i].content || '')
      }

      let mods = 0
      let newStages = 0
      try {
        const parsed = JSON.parse(reflectContent.match(/\{[^}]*stage_modifications[^}]*\}/)?.[0] || '{}')
        mods = parsed.stage_modifications?.length || 0
        newStages = parsed.new_stages?.length || 0
      } catch { /* ignore */ }

      const hasChanges = mods > 0 || newStages > 0
      story.push({
        kind: 'reflect',
        title: hasChanges ? '🔀 Plan Adjusted' : '➡️ Plan Unchanged',
        detail: hasChanges
          ? `${mods} modification${mods !== 1 ? 's' : ''}, ${newStages} new stage${newStages !== 1 ? 's' : ''}`
          : 'Continuing with current plan',
        icon: hasChanges ? '🔀' : '➡️',
      })
      i++
      continue
    }

    // ── Completion ──
    if (/success criteria.*met|All.*criteria/i.test(c) && a === 'stage_orchestrator') {
      story.push({
        kind: 'completion',
        title: '🎉 All Criteria Met',
        detail: 'Analysis complete — proceeding to summary',
        icon: '🎉',
        success: true,
      })
      i++
      continue
    }

    // ── Summary agent ──
    if (a === 'summary_agent') {
      while (i + 1 < events.length && events[i + 1].author === 'summary_agent') i++
      story.push({
        kind: 'summary',
        title: '📝 Final Summary',
        detail: 'Generating executive summary of all findings',
        icon: '📝',
        success: true,
      })
      i++
      continue
    }

    // ── Errors ──
    if (t === 'error') {
      story.push({
        kind: 'error',
        title: '❌ Error',
        detail: truncWords(c, 8),
        icon: '❌',
        success: false,
      })
      i++
      continue
    }

    // Skip system status events and other noise
    i++
  }

  return story
}

// ── Build Graph from Story ──────────────────────────────────────

function buildGraph(
  events: ProjectEvent[],
  stages: Stage[],
  figureMap: Record<number, { names: string[]; paths: string[] }>,
): { nodes: Node[]; edges: Edge[] } {
  const story = parseStory(events, stages, figureMap)
  if (story.length === 0) return { nodes: [], edges: [] }

  const nodes: Node[] = []
  const edges: Edge[] = []

  // Layout: vertical timeline with stages on center, phases branching left/right
  const CENTER_X = 400
  const STAGE_GAP = 50
  const PHASE_GAP = 90
  const BRANCH_OFFSET = 320

  let y = 0
  let lastNodeId: string | null = null
  let stageCount = 0
  let phaseInStage = 0

  for (let i = 0; i < story.length; i++) {
    const s = story[i]
    const nodeId = `s-${i}`

    if (s.kind === 'stage') {
      y += stageCount > 0 ? STAGE_GAP + 20 : 30
      stageCount++
      phaseInStage = 0

      nodes.push({
        id: nodeId,
        type: 'storyStage',
        position: { x: CENTER_X - 140, y },
        data: { ...s },
      })

      if (lastNodeId) {
        edges.push({
          id: `e-${lastNodeId}-${nodeId}`,
          source: lastNodeId,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: '#8b5cf6', strokeWidth: 3 },
          animated: true,
        })
      }
      lastNodeId = nodeId
      y += 80
    } else if (s.kind === 'completion') {
      y += STAGE_GAP
      nodes.push({
        id: nodeId,
        type: 'storyCompletion',
        position: { x: CENTER_X - 120, y },
        data: { ...s },
      })
      if (lastNodeId) {
        edges.push({
          id: `e-${lastNodeId}-${nodeId}`,
          source: lastNodeId,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: '#059669', strokeWidth: 3 },
          animated: true,
        })
      }
      lastNodeId = nodeId
      y += 80
    } else {
      // Phase nodes alternate left/right
      phaseInStage++
      const side = phaseInStage % 2 === 1 ? -1 : 1
      const xOffset = side * BRANCH_OFFSET
      y += PHASE_GAP

      nodes.push({
        id: nodeId,
        type: 'storyPhase',
        position: { x: CENTER_X + xOffset - 130, y },
        data: { ...s },
      })

      if (lastNodeId) {
        const color = s.success === false ? '#ef4444'
          : s.success === true ? '#22c55e'
          : PALETTE[s.kind]?.border || '#94a3b8'
        edges.push({
          id: `e-${lastNodeId}-${nodeId}`,
          source: lastNodeId,
          target: nodeId,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 1.8, strokeDasharray: s.kind === 'tool_group' ? '6 3' : undefined },
        })
      }
      lastNodeId = nodeId
    }
  }

  return { nodes, edges }
}

// ── Custom Node Components ──────────────────────────────────────

function StageNode({ data }: { data: StoryNode }) {
  const p = PALETTE.stage
  return (
    <div className="story-node" style={{
      background: `linear-gradient(135deg, ${p.bg}, white)`,
      border: `2.5px solid ${p.border}`,
      borderRadius: 18,
      padding: '14px 24px',
      minWidth: 280,
      maxWidth: 320,
      boxShadow: `0 4px 20px rgba(139,92,246,0.18), 0 1px 4px rgba(0,0,0,0.06)`,
      textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 11, fontWeight: 800, color: p.border, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        {data.icon} {data.title}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: p.text, lineHeight: 1.4 }}>
        {data.detail}
      </div>
      {data.timestamp && (
        <div style={{ fontSize: 9, color: '#a78bfa', marginTop: 4 }}>{data.timestamp}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function CompletionNode({ data }: { data: StoryNode }) {
  const p = PALETTE.completion
  return (
    <div className="story-node" style={{
      background: `linear-gradient(135deg, ${p.bg}, #d1fae5)`,
      border: `2.5px solid ${p.border}`,
      borderRadius: 18,
      padding: '14px 24px',
      minWidth: 240,
      maxWidth: 300,
      boxShadow: `0 4px 20px rgba(5,150,105,0.18)`,
      textAlign: 'center',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 18, marginBottom: 4 }}>🎉</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: p.text }}>{data.title}</div>
      <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>{data.detail}</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function PhaseNode({ data }: { data: StoryNode }) {
  const p = PALETTE[data.kind] || PALETTE.summary
  const borderColor = data.success === false ? '#ef4444' : data.success === true ? '#22c55e' : p.border
  const bgColor = data.success === false ? '#fef2f2' : data.success === true ? '#f0fdf4' : p.bg
  const isFigure = data.kind === 'figure'

  return (
    <div className="story-node" style={{
      background: bgColor,
      border: `2px solid ${borderColor}`,
      borderRadius: 14,
      padding: '10px 16px',
      minWidth: isFigure ? 260 : 220,
      maxWidth: isFigure ? 340 : 280,
      boxShadow: `0 2px 10px ${borderColor}22, 0 1px 3px rgba(0,0,0,0.05)`,
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{data.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: borderColor }}>{data.title}</span>
        {data.toolCount && (
          <span style={{
            fontSize: 9, background: `${p.accent}66`, color: p.text,
            padding: '1px 6px', borderRadius: 8, fontWeight: 600,
          }}>
            {data.toolCount}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {data.detail}
      </div>
      {/* Figure thumbnails */}
      {data.figurePaths && data.figurePaths.length > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: data.figurePaths.length === 1 ? '1fr' : '1fr 1fr', gap: 4 }}>
          {data.figurePaths.slice(0, 4).map((path, idx) => (
            <div key={idx} style={{
              borderRadius: 6, overflow: 'hidden', border: '1px solid #d1fae5',
              background: '#fff', position: 'relative',
            }}>
              <img
                src={path}
                alt={data.figures?.[idx] || 'figure'}
                style={{ width: '100%', height: 56, objectFit: 'cover', display: 'block' }}
                loading="lazy"
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
                padding: '8px 4px 2px', fontSize: 8, color: '#fff',
                fontFamily: 'monospace', lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {(data.figures?.[idx] || '').replace(/^stage\d+_/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Fallback: filename badges when no paths */}
      {(!data.figurePaths || data.figurePaths.length === 0) && data.figures && data.figures.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.figures.slice(0, 4).map((f, idx) => (
            <span key={idx} style={{
              fontSize: 9, background: '#d1fae5', color: '#065f46',
              padding: '2px 6px', borderRadius: 6, fontFamily: 'monospace',
            }}>
              📊 {f.length > 25 ? f.slice(0, 22) + '…' : f}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes: NodeTypes = {
  storyStage: StageNode,
  storyPhase: PhaseNode,
  storyCompletion: CompletionNode,
}

// ── CSS ─────────────────────────────────────────────────────────

const graphStyles = `
  .story-node {
    animation: nodeSlideIn 0.5s ease-out both;
    transition: transform 0.25s ease, box-shadow 0.25s ease;
    cursor: default;
  }
  .story-node:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0,0,0,0.12) !important;
    z-index: 10;
  }
  @keyframes nodeSlideIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .react-flow__edge-path {
    transition: stroke-width 0.2s ease;
  }
  .react-flow__edge:hover .react-flow__edge-path {
    stroke-width: 3.5 !important;
  }
  .react-flow__minimap {
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
`

// ── Legend Items ─────────────────────────────────────────────────

const LEGEND: { label: string; color: string; icon: string }[] = [
  { label: 'Stage', color: '#8b5cf6', icon: '🎯' },
  { label: 'Implementation', color: '#3b82f6', icon: '🛠' },
  { label: 'Tools', color: '#eab308', icon: '⚙️' },
  { label: 'Figures', color: '#10b981', icon: '📊' },
  { label: 'Review', color: '#a855f7', icon: '📋' },
  { label: 'Criteria', color: '#f97316', icon: '📊' },
  { label: 'Error', color: '#ef4444', icon: '❌' },
]

// ── Main Component ──────────────────────────────────────────────

interface WorkflowGraphProps {
  events: ProjectEvent[]
  isRunning?: boolean
  projectId?: string
  files?: GeneratedFile[]
  stages?: Stage[]
}

export default function WorkflowGraph({ events, isRunning = false, projectId = '', files = [], stages = [] }: WorkflowGraphProps) {
  const [generated, setGenerated] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])

  const handleGenerate = useCallback(() => {
    setGenerating(true)
    setTimeout(() => {
      const figureMap = mapFiguresToStages(files, projectId)
      const { nodes: n, edges: e } = buildGraph(events, stages, figureMap)
      setNodes(n)
      setEdges(e)
      setGenerated(true)
      setGenerating(false)
    }, 300)
  }, [events, stages, files, projectId, setNodes, setEdges])

  if (!generated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-center mb-2">
          <h3 className="text-base font-semibold text-gray-700 mb-1">Workflow Story</h3>
          <p className="text-sm text-gray-400">
            See the full narrative of your analysis — what the agents tried,
            <br />what worked, what didn't, and which figures were produced.
            <br />
            <span className="text-xs text-gray-300 mt-1 inline-block">
              {events.length} events to visualize
            </span>
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating || events.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 text-white rounded-xl font-medium text-sm shadow-lg hover:shadow-xl hover:from-violet-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Building story…</>
          ) : (
            <><Play className="w-4 h-4" /> Generate Workflow Story</>
          )}
        </button>
        {events.length === 0 && (
          <p className="text-xs text-gray-400 italic">No events yet to visualize</p>
        )}
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: '100%', height: 'calc(100vh - 280px)', minHeight: 500, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
      <style>{graphStyles}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.1 }}
        minZoom={0.05}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background color="#f1f0fb" gap={30} size={1.5} />
        <Controls
          showInteractive={false}
          style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}
        />
        <MiniMap
          nodeColor={(n) => {
            const kind = n.data?.kind as StoryKind
            return PALETTE[kind]?.border || '#94a3b8'
          }}
          maskColor="rgba(255,255,255,0.75)"
          style={{ width: 150, height: 100 }}
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/92 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-gray-200 shadow-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ fontSize: 10 }}>{l.icon}</span>
              <span className="text-[10px] text-gray-500 font-medium">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {isRunning && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-violet-50 text-violet-600 px-3 py-1.5 rounded-full text-xs font-medium border border-violet-200 shadow-sm">
          <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
          Live — refresh to update
        </div>
      )}

      <button
        onClick={handleGenerate}
        className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/92 backdrop-blur-sm text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
      >
        <Play className="w-3 h-3" />
        Refresh
      </button>
    </div>
  )
}
