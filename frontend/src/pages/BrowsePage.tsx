import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import { HoverPreviewProvider } from '../components/browse/HoverPreview'
import TitleDetailModal from '../components/detail/TitleDetailModal'
import { openTitleId } from '../features/detail/detailRoute'
import HeroBanner from '../components/HeroBanner'
import TitleRow from '../components/TitleRow'
import { selectLanguage } from '../features/auth/authSlice'
import { homeRequested } from '../features/browse/browseSlice'
import { useT } from '../i18n'

export default function BrowsePage() {
  const dispatch = useAppDispatch()
  const { status, feed, error } = useAppSelector((s) => s.browse)
  const lang = useAppSelector(selectLanguage)
  const t = useT()
  const detailId = openTitleId(useLocation()) // /browse?title=123 opens the detail modal over the page

  // Load once per profile; coming back from the player reuses the feed already in the store.
  useEffect(() => {
    if (status === 'idle') dispatch(homeRequested({ lang }))
  }, [status, lang, dispatch])

  const reload = () => dispatch(homeRequested({ lang }))

  return (
    <div className="min-h-screen overflow-x-hidden">
      <AppHeader />

      {status === 'failed' && (
        <Message title={t.browse.loadFailed} detail={error ?? ''} onRetry={reload} />
      )}

      {(status === 'loading' || status === 'idle') && !feed && <BrowseSkeleton />}

      {feed && feed.heroes.length === 0 && feed.rows.length === 0 && (
        <Message
          title={t.browse.empty}
          detail={t.browse.emptyDetail}
          onRetry={reload}
        />
      )}

      {feed && feed.heroes.length > 0 && <HeroBanner heroes={feed.heroes} paused={detailId !== null} />}

      {feed && feed.rows.length > 0 && (
        // The first row slides up over the faded bottom of the hero.
        <main className={`relative z-10 space-y-3 md:space-y-6 ${feed.heroes.length > 0 ? '-mt-[7vw]' : 'pt-24'}`}>
          <HoverPreviewProvider>
            {feed.rows.map((row) => (
              <TitleRow key={row.key} row={row} />
            ))}
          </HoverPreviewProvider>
        </main>
      )}

      {feed && <AppFooter />}

      {detailId !== null && <TitleDetailModal titleId={detailId} />}
    </div>
  )
}

function Message({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  const t = useT()
  return (
    <div className="mx-auto max-w-xl px-4 pt-40 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted">{detail}</p>
      <button type="button" onClick={onRetry} className="mt-6 rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-hover">
        {t.common.retry}
      </button>
    </div>
  )
}

function BrowseSkeleton() {
  const t = useT()
  return (
    <div className="animate-pulse" aria-label={t.common.loading}>
      <div className="h-[56.25vw] max-h-[85vh] min-h-[460px] bg-surface-raised" />
      {[0, 1].map((r) => (
        <div key={r} className="mt-8 px-4 md:px-12">
          <div className="mb-3 h-5 w-48 rounded bg-surface-raised" />
          <div className="flex gap-1.5 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <div key={c} className="aspect-video w-[44vw] shrink-0 rounded-sm bg-surface-raised sm:w-[30vw] md:w-[23vw] lg:w-[18.5vw] xl:w-[15.5vw]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
