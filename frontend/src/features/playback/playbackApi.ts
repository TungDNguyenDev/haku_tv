import axios from 'axios'
import { http } from '../../services/http'

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
  drm: PlaybackDrm | null
}

// 'no-video' / 'files-missing' (404) and 'not-allowed' (403, Kids profile) come from the API, 'network' = API unreachable or unexpected error.
export type PlaybackErrorCode = 'no-video' | 'not-allowed' | 'files-missing' | 'network'

export async function getPlayback(titleId: number, episodeId: number | null, lang: string): Promise<PlaybackInfo> {
  const res = await http.get<PlaybackInfo>(`/api/playback/${titleId}`, {
    params: { lang, ...(episodeId !== null && { episodeId }) },
  })
  return res.data
}

export function toPlaybackErrorCode(err: unknown): PlaybackErrorCode {
  if (axios.isAxiosError<{ code?: string }>(err)) {
    const code = err.response?.data?.code
    if (code === 'no-video' || code === 'not-allowed' || code === 'files-missing') return code
  }
  return 'network'
}
