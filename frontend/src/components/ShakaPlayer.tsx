import { useEffect, useEffectEvent, useRef } from 'react'
import shaka from 'shaka-player/dist/shaka-player.ui'
import 'shaka-player/dist/controls.css'
import type { PlaybackDrm } from '../features/playback/playbackApi'
import { getAccessToken } from '../services/http'

/**
 * Why a position is reported: tick = every few seconds while playing, pause (also a seek while paused), ended,
 * leave = the player is closed (page left, other episode), pagehide = the tab is closed or reloaded.
 */
export type ProgressReason = 'tick' | 'pause' | 'ended' | 'leave' | 'pagehide'

const HEARTBEAT_MS = 10_000

interface Props {
  manifestUrl: string
  drm: PlaybackDrm | null
  /** Seconds to start at (where the profile stopped); 0 = from the start. Read once, when the video loads. */
  startTime?: number
  /** Shaka error code (https://shaka-player-demo.appspot.com/docs/api/shaka.util.Error.html), -1 = browser not supported. */
  onError: (code: number) => void
  onProgress?: (position: { seconds: number; duration: number }, reason: ProgressReason) => void
}

// Shaka Player + its default UI (seek bar, quality, fullscreen...). Phase 6 replaces the UI with our own controls.
// This module is only imported by the lazy-loaded WatchPage, so the ~700 KB player never lands in the browse bundle.
export default function ShakaPlayer({ manifestUrl, drm, startTime = 0, onError, onProgress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reportError = useEffectEvent(onError)
  const reportProgress = useEffectEvent((seconds: number, duration: number, reason: ProgressReason) =>
    onProgress?.({ seconds, duration }, reason),
  )
  const startAt = useEffectEvent(() => startTime)

  const keySystem = drm?.keySystem ?? null
  const licenseUrl = drm?.licenseUrl ?? null

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    shaka.polyfill.installAll()
    if (!shaka.Player.isBrowserSupported()) {
      reportError(-1)
      return
    }

    // Aborted on unmount / source change: late callbacks of the old player must not report errors.
    const lifetime = new AbortController()
    const cancelled = () => lifetime.signal.aborted
    const player = new shaka.Player()
    const ui = new shaka.ui.Overlay(player, container, video)
    ui.configure({
      seekBarColors: { base: 'rgba(255,255,255,0.3)', buffered: 'rgba(255,255,255,0.55)', played: '#e50914' },
      overflowMenuButtons: ['quality', 'language', 'captions', 'playback_rate', 'picture_in_picture'],
    })

    // ClearKey: the player asks the license endpoint for the key of the KID it finds in the segments.
    player.configure({ drm: { servers: keySystem && licenseUrl ? { [keySystem]: licenseUrl } : {} } })

    // The license endpoint only answers a signed-in profile allowed to watch this title: send the access token.
    // It is read when the request is made, so a token refreshed meanwhile is picked up.
    // (Manifest and segments need no header: GET /api/playback set a signed cookie for this video's folder.)
    player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
      const token = getAccessToken()
      if (type === shaka.net.NetworkingEngine.RequestType.LICENSE && token) {
        request.headers['Authorization'] = `Bearer ${token}`
      }
    })

    player.addEventListener('error', (event) => {
      const detail = (event as unknown as { detail?: { code?: number } }).detail
      if (!cancelled()) reportError(detail?.code ?? 0)
    })

    // Progress: only once the video has really played. Before that currentTime is 0 (or still loading) and saving
    // it would overwrite where the viewer stopped last time.
    const session = { played: false }
    const report = (reason: ProgressReason) => {
      const duration = video.duration
      if (session.played && Number.isFinite(duration) && duration > 0) reportProgress(video.currentTime, duration, reason)
    }
    const onPlaying = () => {
      session.played = true
    }
    const onPause = () => {
      if (!video.ended) report('pause') // "ended" also fires pause; reported once, as ended
    }
    const onSeeked = () => {
      if (video.paused) report('pause') // while playing, the next tick saves it
    }
    const onEnded = () => report('ended')
    const onPageHide = () => report('pagehide')
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('ended', onEnded)
    window.addEventListener('pagehide', onPageHide)
    const heartbeat = window.setInterval(() => {
      if (!video.paused) report('tick')
    }, HEARTBEAT_MS)

    const start = async () => {
      try {
        await player.attach(video)
        if (cancelled()) return
        // Resume a little before the exact second, so the viewer catches the last words again.
        const resumeAt = startAt() > 5 ? startAt() - 3 : undefined
        await player.load(manifestUrl, resumeAt)
        if (cancelled()) return
        // Autoplay with sound is allowed here because the user clicked Play to get to this page.
        await video.play().catch(() => undefined)
      } catch (err) {
        // LOAD_INTERRUPTED (7000) = we navigated away mid-load; not an error for the user.
        if (!cancelled() && err instanceof shaka.util.Error && err.code !== shaka.util.Error.Code.LOAD_INTERRUPTED) {
          reportError(err.code)
        }
      }
    }
    void start()

    return () => {
      // Report before tearing down: destroying the player resets the video element.
      if (!cancelled()) report('leave')
      window.clearInterval(heartbeat)
      window.removeEventListener('pagehide', onPageHide)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('ended', onEnded)
      lifetime.abort()
      void ui.destroy() // also destroys the player and releases the media keys
    }
  }, [manifestUrl, keySystem, licenseUrl])

  return (
    <div ref={containerRef} className="size-full" data-shaka-player-container>
      <video ref={videoRef} className="size-full" playsInline />
    </div>
  )
}
