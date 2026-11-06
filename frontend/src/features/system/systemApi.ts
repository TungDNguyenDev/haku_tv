import { http } from '../../services/http'

export interface HealthResponse {
  api: string
  database: 'ok' | 'down'
  databaseName?: string
  edition?: string
  error?: string
}

export async function getHealth(): Promise<HealthResponse> {
  // The API answers 503 with a body when the database is down, so accept that status too.
  const res = await http.get<HealthResponse>('/api/health', { validateStatus: (s) => s === 200 || s === 503 })
  return res.data
}
