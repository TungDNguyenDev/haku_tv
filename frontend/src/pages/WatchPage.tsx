import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { BackIcon } from '../components/icons'
import ShakaPlayer from '../components/ShakaPlayer'
import type { PlaybackErrorCode, PlaybackInfo } from '../features/playback/playbackApi'
import { selectLanguage } from '../features/auth/authSlice'
import { playbackCleared, playbackRequested } from '../features/playback/playbackSlice'

const API_ERRORS: Record<PlaybackErrorCode, string> = {
  'no-video': 'Phim này chưa có video.',
  'not-allowed': 'Nội dung này không dành cho hồ sơ trẻ em.',
  'files-missing': 'Không tìm thấy file video trên server (thư mục media/packaged). Hãy chạy lại tools/package.ps1.',
  network: 'Không kết nối được tới API. API (.NET) đã chạy chưa?',
}

// Shaka error codes worth a plain-language message; the rest show their number.
function playerErrorMessage(code: number): string {
  if (code === -1) return 'Trình duyệt này không hỗ trợ phát video có DRM.'
  if (code === 6007 || code === 6008) return 'Không lấy được key giải mã từ license server (/api/drm/clearkey/license).'
  if (code === 6001 || code === 6002) return 'Trình duyệt không hỗ trợ ClearKey.'
  if (code >= 1000 && code < 2000) return `Không tải được video (lỗi mạng ${code}).`
  return `Lỗi khi phát video (mã ${code}).`
}

function subtitle(info: PlaybackInfo): string | null {
  if (info.episodeNumber === null) return null
  const label = `Phần ${info.seasonNumber}, Tập ${info.episodeNumber}`
  return info.episodeName ? `${label}: ${info.episodeName}` : label
}

export default function WatchPage() {
  const { titleId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { status, info, error } = useAppSelector((s) => s.playback)
  const lang = useAppSelector(selectLanguage)
  const chrome = useIdleChrome()

  const id = Number(titleId)
  const episodeParam = search.get('episode')
  const episodeId = episodeParam ? Number(episodeParam) : null

  // A player error belongs to one source; switching title/episode makes the old one irrelevant without a reset effect.
  const sourceKey = `${id}:${episodeId}`
  const [failure, setFailure] = useState<{ sourceKey: string; code: number } | null>(null)
  const playerError = failure?.sourceKey === sourceKey ? failure.code : null
  const onPlayerError = useCallback((code: number) => setFailure({ sourceKey, code }), [sourceKey])

  useEffect(() => {
    if (!Number.isInteger(id)) return
    dispatch(playbackRequested({ titleId: id, episodeId, lang }))
    return () => {
      dispatch(playbackCleared())
    }
  }, [id, episodeId, lang, dispatch])

  const message = !Number.isInteger(id)
    ? 'Đường dẫn không hợp lệ.'
    : error
      ? API_ERRORS[error]
      : playerError !== null
        ? playerErrorMessage(playerError)
        : null

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={chrome.wake} onTouchStart={chrome.wake}>
      {status === 'succeeded' && info && playerError === null && (
        <ShakaPlayer manifestUrl={info.manifestUrl} drm={info.drm} onError={onPlayerError} />
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-14 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
        </div>
      )}

      {message && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <p className="text-lg">{message}</p>
            <button type="button" onClick={() => navigate('/browse')} className="mt-6 rounded bg-white px-5 py-2 font-semibold text-black hover:bg-white/80">
              Về trang chủ
            </button>
          </div>
        </div>
      )}

      {/* Top bar: back button + title. Fades out after a few seconds without mouse movement, like the real players. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-4 bg-linear-to-b from-black/80 to-transparent p-4 transition-opacity duration-500 md:p-6 ${
          chrome.visible || message ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label="Quay lại"
          onClick={() => navigate(-1)}
          className="pointer-events-auto rounded-full p-1 hover:bg-white/10"
        >
          <BackIcon />
        </button>
        {info && (
          <div className="leading-tight">
            <p className="text-lg font-semibold md:text-2xl">{info.titleName}</p>
            {subtitle(info) && <p className="text-sm text-muted md:text-base">{subtitle(info)}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function useIdleChrome(timeoutMs = 3000) {
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | undefined>(undefined)

  const wake = useCallback(() => {
    setVisible(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), timeoutMs)
  }, [timeoutMs])

  // Visible on arrival (initial state), hidden after the first idle period.
  useEffect(() => {
    timer.current = window.setTimeout(() => setVisible(false), timeoutMs)
    return () => window.clearTimeout(timer.current)
  }, [timeoutMs])

  return { visible, wake }
}
