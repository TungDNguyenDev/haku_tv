import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { BackIcon } from '../components/icons'
import ShakaPlayer, { type ProgressReason } from '../components/ShakaPlayer'
import { saveProgressOnUnload, type PlaybackInfo } from '../features/playback/playbackApi'
import { selectLanguage } from '../features/auth/authSlice'
import { playbackCleared, playbackRequested, progressReported } from '../features/playback/playbackSlice'
import { useT, type Messages } from '../i18n'

// Shaka error codes worth a plain-language message; the rest show their number.
function playerErrorMessage(t: Messages, code: number): string {
  if (code === -1) return t.watch.noDrm
  if (code === 6007 || code === 6008) return t.watch.noLicense
  if (code === 6001 || code === 6002) return t.watch.noClearKey
  if (code >= 1000 && code < 2000) return t.watch.networkError(code)
  return t.watch.playerError(code)
}

function subtitle(t: Messages, info: PlaybackInfo): string | null {
  if (info.episodeNumber === null) return null
  const label = t.watch.episode(info.seasonNumber, info.episodeNumber)
  return info.episodeName ? `${label}: ${info.episodeName}` : label
}

export default function WatchPage() {
  const { titleId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { status, info, error } = useAppSelector((s) => s.playback)
  const lang = useAppSelector(selectLanguage)
  const t = useT()
  const chrome = useIdleChrome()

  const id = Number(titleId)
  const episodeParam = search.get('episode')
  const episodeId = episodeParam ? Number(episodeParam) : null

  // A player error belongs to one source; switching title/episode makes the old one irrelevant without a reset effect.
  const sourceKey = `${id}:${episodeId}`
  const [failure, setFailure] = useState<{ sourceKey: string; code: number } | null>(null)
  const playerError = failure?.sourceKey === sourceKey ? failure.code : null
  const onPlayerError = useCallback((code: number) => setFailure({ sourceKey, code }), [sourceKey])

  // Watch progress → API. Closing the tab cannot wait for a saga: that last save goes out as a keepalive request.
  const onProgress = useCallback(
    (position: { seconds: number; duration: number }, reason: ProgressReason) => {
      if (!info) return
      const report = {
        titleId: info.titleId,
        episodeId: info.episodeId,
        positionSeconds: position.seconds,
        durationSeconds: position.duration,
      }
      if (reason === 'pagehide') saveProgressOnUnload(report)
      else dispatch(progressReported({ report, leaving: reason === 'leave' }))
    },
    [info, dispatch],
  )

  useEffect(() => {
    if (!Number.isInteger(id)) return
    dispatch(playbackRequested({ titleId: id, episodeId, lang }))
    return () => {
      dispatch(playbackCleared())
    }
  }, [id, episodeId, lang, dispatch])

  const message = !Number.isInteger(id)
    ? t.watch.badLink
    : error
      ? t.watch.errors[error]
      : playerError !== null
        ? playerErrorMessage(t, playerError)
        : null

  return (
    <div className="fixed inset-0 bg-black" onMouseMove={chrome.wake} onTouchStart={chrome.wake}>
      {status === 'succeeded' && info && playerError === null && (
        <ShakaPlayer
          manifestUrl={info.manifestUrl}
          drm={info.drm}
          startTime={info.startPositionSeconds}
          onError={onPlayerError}
          onProgress={onProgress}
        />
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
              {t.watch.home}
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
          aria-label={t.watch.back}
          onClick={() => navigate(-1)}
          className="pointer-events-auto rounded-full p-1 hover:bg-white/10"
        >
          <BackIcon />
        </button>
        {info && (
          <div className="leading-tight">
            <p className="text-lg font-semibold md:text-2xl">{info.titleName}</p>
            {subtitle(t, info) && <p className="text-sm text-muted md:text-base">{subtitle(t, info)}</p>}
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
