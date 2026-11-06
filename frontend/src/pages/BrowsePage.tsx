import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { CATALOG_LANGUAGE } from '../app/config'
import AppFooter from '../components/AppFooter'
import AppHeader from '../components/AppHeader'
import { HoverPreviewProvider } from '../components/browse/HoverPreview'
import HeroBanner from '../components/HeroBanner'
import TitleRow from '../components/TitleRow'
import { homeRequested } from '../features/browse/browseSlice'

export default function BrowsePage() {
  const dispatch = useAppDispatch()
  const { status, feed, error } = useAppSelector((s) => s.browse)

  // Load once; coming back from the player reuses the feed already in the store.
  useEffect(() => {
    if (status === 'idle') dispatch(homeRequested({ lang: CATALOG_LANGUAGE }))
  }, [status, dispatch])

  const reload = () => dispatch(homeRequested({ lang: CATALOG_LANGUAGE }))

  return (
    <div className="min-h-screen overflow-x-hidden">
      <AppHeader />

      {status === 'failed' && (
        <Message title="Không tải được danh mục phim" detail={`${error}. API (.NET) và SQL Server đã chạy chưa?`} onRetry={reload} />
      )}

      {(status === 'loading' || status === 'idle') && !feed && <BrowseSkeleton />}

      {feed && !feed.hero && feed.rows.length === 0 && (
        <Message
          title="Chưa có phim nào trong database"
          detail="Chạy seeder TMDB (backend/tools/HakuTV.Seeder) hoặc dữ liệu mẫu database/dev/dev_catalog_seed.sql, rồi database/dev/attach_sample_video.sql."
          onRetry={reload}
        />
      )}

      {feed?.hero && <HeroBanner hero={feed.hero} />}

      {feed && feed.rows.length > 0 && (
        // The first row slides up over the faded bottom of the hero.
        <main className={`relative z-10 space-y-3 md:space-y-6 ${feed.hero ? '-mt-[7vw]' : 'pt-24'}`}>
          <HoverPreviewProvider>
            {feed.rows.map((row) => (
              <TitleRow key={row.key} row={row} />
            ))}
          </HoverPreviewProvider>
        </main>
      )}

      {feed && <AppFooter />}
    </div>
  )
}

function Message({ title, detail, onRetry }: { title: string; detail: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 pt-40 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted">{detail}</p>
      <button type="button" onClick={onRetry} className="mt-6 rounded bg-brand px-5 py-2 font-semibold hover:bg-brand-hover">
        Thử lại
      </button>
    </div>
  )
}

function BrowseSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Đang tải">
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
