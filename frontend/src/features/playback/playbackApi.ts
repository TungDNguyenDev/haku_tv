import axios from 'axios'
import { getAccessToken, http } from '../../services/http'

export interface PlaybackDrm {
  keySystem: string // 'org.w3.clearkey'
  licenseUrl: string
}

export interface PlaybackInfo {
  titleId: number
  titleType: 1 | 2
  titleName: string
  episodeId: number | null
  seasonNumber: number | null
  episodeNumber: number | null
  episodeName: string | null
  manifestUrl: string
  startPositionSeconds: number // where this profile stopped (0 = from the start)
  drm: PlaybackDrm | null
}

export interface ProgressReport {
  titleId: number
  episodeId: number | null
  positionSeconds: number
  durationSeconds: number
}

// 'no-video' / 'files-missing' (404) and 'not-allowed' (403, Kids profile) come from the API, 'network' = API unreachable or unexpected error.
export type PlaybackErrorCode = 'no-video' | 'not-allowed' | 'files-missing' | 'network'

export async function getPlayback(titleId: number, episodeId: number | null, lang: string): Promise<PlaybackInfo> {
  const res = await http.get<PlaybackInfo>(`/api/playback/${titleId}`, {
    params: { lang, ...(episodeId !== null && { episodeId }) },
  })
  return res.data
}

/** Player heartbeat. */
export async function saveProgress(report: ProgressReport): Promise<void> {
  await http.put('/api/progress', report)
}

/**
 * The last heartbeat when the tab is closed or reloaded: a normal request would be cancelled with the page,
 * a keepalive fetch is allowed to finish after it. (sendBeacon cannot send the Authorization header.)
 */
export function saveProgressOnUnload(report: ProgressReport) {
  const token = getAccessToken()
  if (!token) return
  void fetch(`${http.defaults.baseURL ?? ''}/api/progress`, {
    method: 'PUT',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(report),
  }).catch(() => undefined)
}

export function toPlaybackErrorCode(err: unknown): PlaybackErrorCode {
  if (axios.isAxiosError<{ code?: string }>(err)) {
    const code = err.response?.data?.code
    if (code === 'no-video' || code === 'not-allowed' || code === 'files-missing') return code
  }
  return 'network'
}
