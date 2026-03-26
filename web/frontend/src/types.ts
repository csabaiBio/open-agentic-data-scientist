export type ProjectStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'awaiting_confirmation'
export type ProjectMode = 'orchestrated' | 'simple' | 'discovery'
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Stage {
  index: number
  title: string
  description: string
  status: StageStatus
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
}

export interface ProjectEvent {
  id: number
  type: 'message' | 'thought' | 'tool_call' | 'tool_result' | 'status' | 'error' | 'done' | 'usage'
    | 'discovery_phase' | 'discovery_paper' | 'discovery_synthesis' | 'discovery_hypothesis' | 'discovery_research_question'
  content: string
  author: string
  timestamp: string
  is_thought: boolean
  stage_index: number | null
  metadata: Record<string, any>
}

export interface PubMedPaper {
  pmid: string
  title: string
  abstract: string
  authors: string[]
  journal: string
  pub_date: string
  doi: string
  keywords: string[]
}

export interface DiscoveryResult {
  papers: PubMedPaper[]
  synthesis: string
  hypothesis: string
  datasets: string
  research_question: string
  analysis_prompt: string
}

export interface GeneratedFile {
  path: string
  name: string
  size: number
  type: 'figure' | 'report' | 'data' | 'code' | 'other'
  stage_index: number | null
  created_at: string
}

export type ModelProvider = 'bedrock' | 'openrouter' | 'openai' | 'anthropic' | 'local'

export interface ModelConfig {
  provider: ModelProvider
  planning_model: string
  coding_model: string
  litellm_api_base: string | null
  coding_api_base: string | null
  api_base: string | null
  api_key: string | null
}

export interface Project {
  id: string
  query: string
  mode: ProjectMode
  status: ProjectStatus
  created_at: string
  started_at: string | null
  completed_at: string | null
  duration: number | null
  working_dir: string
  stages: Stage[]
  events: ProjectEvent[]
  files: GeneratedFile[]
  error: string | null
  input_files: string[]
  num_papers: number
  days_back: number
  max_cost_usd: number | null
  discovery: DiscoveryResult | null
  discovery_phase: string | null
  analysis_query: string | null
  // Model configuration
  llm_config: ModelConfig | null
  // Persisted generated content
  paper_content: string | null
  in_silico_suggestions: string | null
  experimental_suggestions: string | null
  // Skills/tools used during the workflow
  skills_used: string[]
  total_cost_usd: number
  llm_calls: number
  total_prompt_tokens: number
  total_completion_tokens: number
  total_cached_tokens: number
  total_tokens: number
}

export interface ProjectSummary {
  id: string
  query: string
  mode: ProjectMode
  status: ProjectStatus
  created_at: string
  duration: number | null
  stages_total: number
  stages_completed: number
  files_count: number
  discovery_phase: string | null
  total_cost_usd: number
  max_cost_usd: number | null
  llm_calls: number
  llm_config: ModelConfig | null
}
