import type { Project, ProjectEvent, ProjectSummary } from './types'

const BASE = new URL('api/', `${window.location.origin}${import.meta.env.BASE_URL}`).pathname.replace(/\/$/, '')

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${BASE}/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

export async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${BASE}/projects/${id}`)
  if (!res.ok) throw new Error('Failed to fetch project')
  return res.json()
}

export interface CreateProjectOpts {
  query: string
  mode: string
  files: File[]
  numPapers?: number
  daysBack?: number
  modelProvider?: string
  planningModel?: string
  codingModel?: string
  modelApiBase?: string
  modelApiKey?: string
  baseProjectId?: string
}

export async function createProject(opts: CreateProjectOpts): Promise<Project> {
  const form = new FormData()
  form.append('query', opts.query)
  form.append('mode', opts.mode)
  form.append('num_papers', String(opts.numPapers ?? 10))
  form.append('days_back', String(opts.daysBack ?? 30))
  if (opts.modelProvider) form.append('model_provider', opts.modelProvider)
  if (opts.planningModel) form.append('planning_model', opts.planningModel)
  if (opts.codingModel) form.append('coding_model', opts.codingModel)
  if (opts.modelApiBase) form.append('model_api_base', opts.modelApiBase)
  if (opts.modelApiKey) form.append('model_api_key', opts.modelApiKey)
  if (opts.baseProjectId) form.append('base_project_id', opts.baseProjectId)
  for (const f of opts.files) {
    form.append('files', f)
  }
  const res = await fetch(`${BASE}/projects`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || 'Failed to create project')
  }
  return res.json()
}

export async function stopProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}/stop`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to stop project')
}

export async function resumeProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}/resume`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to resume project')
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete project')
}

export async function generatePaper(id: string, title?: string): Promise<{ content: string; title: string; pdf_url?: string }> {
  const res = await fetch(`${BASE}/projects/${id}/paper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('Failed to generate paper')
  return res.json()
}

export function getPaperPdfUrl(id: string): string {
  return `${BASE}/projects/${id}/paper.pdf`
}

export async function confirmDiscovery(
  id: string,
  analysisQuery: string,
): Promise<{ status: string; analysis_query: string }> {
  const res = await fetch(`${BASE}/projects/${id}/confirm-discovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis_query: analysisQuery }),
  })
  if (!res.ok) throw new Error('Failed to confirm discovery')
  return res.json()
}

export async function generateDataSuggestions(
  id: string,
  type: 'in_silico' | 'experimental',
): Promise<{ content: string; type: string }> {
  const res = await fetch(`${BASE}/projects/${id}/data-suggestions/${type}`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to generate data suggestions')
  return res.json()
}

export function getFileUrl(projectId: string, filePath: string): string {
  return `${BASE}/projects/${projectId}/files/${filePath}`
}

export function subscribeToEvents(
  projectId: string,
  onEvent: (event: ProjectEvent) => void,
  onDone: (status: string) => void,
  afterId: number = 0,
): () => void {
  const es = new EventSource(`${BASE}/projects/${projectId}/stream?after=${afterId}`)

  es.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data)
      if (data.type === 'done') {
        onDone(data.status)
        es.close()
      } else {
        onEvent(data as ProjectEvent)
      }
    } catch {
      // ignore parse errors
    }
  }

  es.onerror = () => {
    es.close()
    onDone('error')
  }

  return () => es.close()
}
