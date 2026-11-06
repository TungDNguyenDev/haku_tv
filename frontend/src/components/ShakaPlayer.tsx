import { useEffect, useEffectEvent, useRef } from 'react'
import shaka from 'shaka-player/dist/shaka-player.ui'
import 'shaka-player/dist/controls.css'
import type { PlaybackDrm } from '../features/playback/playbackApi'

interface Props {
  manifestUrl: string
  drm: PlaybackDrm | null
  /** Shaka error code (https://shaka-player-demo.appspot.com/docs/api/shaka.util.Error.html), -1 = browser not supported. */
  onError: (code: number) => void
}

// Shaka Player + its default UI (seek bar, quality, fullscreen...). Phase 6 replaces the UI with our own controls.
// This module is only imported by the lazy-loaded WatchPage, so the ~700 KB player never lands in the browse bundle.
export default function ShakaPlayer({ manifestUrl, drm, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reportError = useEffectEvent(onError)

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

    player.addEventListener('error', (event) => {
      const detail = (event as unknown as { detail?: { code?: number } }).detail
      if (!cancelled()) reportError(detail?.code ?? 0)
    })

    const start = async () => {
      try {
        await player.attach(video)
        if (cancelled()) return
        await player.load(manifestUrl)
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
