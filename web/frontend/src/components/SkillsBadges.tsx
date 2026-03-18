import {
  Terminal, Eye, Pencil, FlaskConical, Search, Lightbulb,
  Cpu, FileText, FolderTree, Globe, Code, CheckCircle2, BarChart3, Wrench,
  FileEdit, FileSearch, BookOpen, Bug, Download, PenTool, Play, Database
} from 'lucide-react'

/* ── Skill registry ────────────────────────────────────────────── */

type SkillDef = { label: string; icon: typeof Cpu; color: string; bg: string; category: 'agent' | 'claude_tool' | 'adk_tool' }

const SKILL_REGISTRY: Record<string, SkillDef> = {
  // ── Claude Code Tools ──
  'Bash':          { label: 'Bash',          icon: Terminal,    color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',  category: 'claude_tool' },
  'Read':          { label: 'Read File',     icon: BookOpen,    color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',        category: 'claude_tool' },
  'Write':         { label: 'Write File',    icon: PenTool,     color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',      category: 'claude_tool' },
  'Edit':          { label: 'Edit File',     icon: FileEdit,    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      category: 'claude_tool' },
  'MultiEdit':     { label: 'Multi Edit',    icon: FileEdit,    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      category: 'claude_tool' },
  'WebFetch':      { label: 'Web Fetch',     icon: Globe,       color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',  category: 'claude_tool' },
  'WebSearch':     { label: 'Web Search',    icon: Search,      color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',  category: 'claude_tool' },
  'Glob':          { label: 'Glob Search',   icon: FileSearch,  color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',      category: 'claude_tool' },
  'Grep':          { label: 'Grep',          icon: Search,      color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',      category: 'claude_tool' },
  'LS':            { label: 'List Dir',      icon: FolderTree,  color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',      category: 'claude_tool' },
  'TodoRead':      { label: 'Todo Read',     icon: CheckCircle2,color: 'text-green-700',   bg: 'bg-green-50 border-green-200',    category: 'claude_tool' },
  'TodoWrite':     { label: 'Todo Write',    icon: CheckCircle2,color: 'text-green-700',   bg: 'bg-green-50 border-green-200',    category: 'claude_tool' },
  'NotebookRead':  { label: 'Notebook Read', icon: BookOpen,    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    category: 'claude_tool' },
  'NotebookEdit':  { label: 'Notebook Edit', icon: FileEdit,    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    category: 'claude_tool' },
  'write_file':    { label: 'Write File',    icon: PenTool,     color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',      category: 'claude_tool' },

  // ── Agents ──
  'plan_maker_agent':    { label: 'Plan Maker',       icon: Pencil,       color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',  category: 'agent' },
  'plan_reviewer_agent': { label: 'Plan Reviewer',    icon: Eye,          color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  category: 'agent' },
  'coding_agent':        { label: 'Code Writer',      icon: Code,         color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',      category: 'agent' },
  'review_agent':        { label: 'Code Reviewer',    icon: Eye,          color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    category: 'agent' },
  'summary_agent':       { label: 'Summarizer',       icon: FileText,     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', category: 'agent' },
  'stage_orchestrator':  { label: 'Orchestrator',     icon: BarChart3,    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      category: 'agent' },
  'success_criteria_checker': { label: 'Criteria Checker', icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-50 border-green-200', category: 'agent' },
  'stage_reflector':     { label: 'Stage Reflector',   icon: Lightbulb,    color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',  category: 'agent' },
  'research_agent':      { label: 'Researcher',       icon: Search,       color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',      category: 'agent' },
  'hypothesis_agent':    { label: 'Hypothesis',       icon: Lightbulb,    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    category: 'agent' },
  'discovery':           { label: 'Discovery',        icon: Search,       color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  category: 'agent' },
  'implementation_review_confirmation_agent': { label: 'Review Gate', icon: CheckCircle2, color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200', category: 'agent' },

  // ── ADK Tools (bound functions) ──
  'read_file_bound':      { label: 'Read File',       icon: FileText,     color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'read_media_file_bound':{ label: 'Read Media',      icon: FileText,     color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'list_directory_bound': { label: 'List Directory',   icon: FolderTree,   color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'directory_tree_bound': { label: 'Directory Tree',   icon: FolderTree,   color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'search_files_bound':   { label: 'Search Files',    icon: FileSearch,   color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'get_file_info_bound':  { label: 'File Info',       icon: FileText,     color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
  'fetch_url':            { label: 'Fetch URL',       icon: Globe,        color: 'text-sky-600',     bg: 'bg-sky-50 border-sky-200',        category: 'adk_tool' },
  'set_model_response':   { label: 'Set Response',    icon: Cpu,          color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',      category: 'adk_tool' },
}

function getSkillDef(skill: string): SkillDef {
  // Exact match first
  if (SKILL_REGISTRY[skill]) return SKILL_REGISTRY[skill]
  // Case-insensitive match
  const lower = skill.toLowerCase()
  for (const [key, def] of Object.entries(SKILL_REGISTRY)) {
    if (key.toLowerCase() === lower) return def
  }
  // Auto-categorize
  const agentKeywords = ['agent', 'orchestrator', 'checker', 'reflector', 'discovery', 'hypothesis']
  const isAgent = agentKeywords.some(k => lower.includes(k))
  // Claude Code tools are typically PascalCase single words
  const isClaudeTool = /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(skill) && !isAgent
  const category = isAgent ? 'agent' : isClaudeTool ? 'claude_tool' : 'adk_tool'
  const label = skill.replace(/_/g, ' ').replace(/\bagent\b/gi, '').replace(/\bbound\b/gi, '').trim()
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').trim() || skill
  return { label, icon: Wrench, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', category }
}

/* ── Categorize skills ─────────────────────────────────────────── */

function categorize(skills: string[]): { agents: string[]; claudeTools: string[]; adkTools: string[] } {
  const agents: string[] = []
  const claudeTools: string[] = []
  const adkTools: string[] = []
  for (const s of skills) {
    const def = getSkillDef(s)
    if (def.category === 'agent') agents.push(s)
    else if (def.category === 'claude_tool') claudeTools.push(s)
    else adkTools.push(s)
  }
  return { agents, claudeTools, adkTools }
}

/* ── Badge renderer ────────────────────────────────────────────── */

function SkillBadge({ skill, isRunning }: { skill: string; isRunning: boolean }) {
  const cfg = getSkillDef(skill)
  const Icon = cfg.icon
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium ${cfg.bg} ${cfg.color} transition-all ${isRunning ? 'animate-fade-in' : ''}`}
      title={skill}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function CategorySection({ title, skills, isRunning, accent }: { title: string; skills: string[]; isRunning: boolean; accent: string }) {
  if (skills.length === 0) return null
  return (
    <div>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${accent}`}>{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {skills.map(skill => <SkillBadge key={skill} skill={skill} isRunning={isRunning} />)}
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────── */

export default function SkillsBadges({ skills, isRunning = false }: { skills: string[]; isRunning?: boolean }) {
  if (skills.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-2">
        {isRunning ? 'Skills will appear as agents and tools are used...' : 'No skills recorded'}
      </div>
    )
  }

  const { agents, claudeTools, adkTools } = categorize(skills)

  return (
    <div className="space-y-3">
      <CategorySection title="Agents" skills={agents} isRunning={isRunning} accent="text-indigo-400" />
      <CategorySection title="Claude Code Tools" skills={claudeTools} isRunning={isRunning} accent="text-orange-400" />
      <CategorySection title="ADK Tools" skills={adkTools} isRunning={isRunning} accent="text-gray-400" />
    </div>
  )
}
