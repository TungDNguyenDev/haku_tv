import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppSelector } from '../app/hooks'
import { CONTINUE_WATCHING, MY_LIST, type BrowseRow } from '../features/browse/browseApi'
import { useT } from '../i18n'
import { BackdropCard, PosterCard, RankCard } from './browse/cards'
import ArrowButton from './ArrowButton'

// Horizontal row. Native scrolling (touch, trackpad, Shift+wheel) plus, on desktop, arrows that page by about
// one screen and a small page indicator. The left arrow only appears once the row has been scrolled.
export default function TitleRow({ row }: { row: BrowseRow }) {
  const scroller = useRef<HTMLDivElement>(null)
  const t = useT()
  const profileName = useAppSelector((s) => s.auth.profile?.name ?? '')
  // The profile's own rows are named here: the My List row can be created on the page, without a name from the API.
  const title =
    row.key === CONTINUE_WATCHING ? t.browse.continueWatching(profileName) : row.key === MY_LIST ? t.browse.myList : row.name
  const [pages, setPages] = useState({ count: 1, current: 0, atStart: true, atEnd: true })

  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    const count = Math.max(1, Math.ceil(el.scrollWidth / el.clientWidth))
    const current = maxScroll <= 0 ? 0 : Math.round((el.scrollLeft / maxScroll) * (count - 1))
    setPages({ count, current, atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= maxScroll - 4 })
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  const page = (dir: -1 | 1) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  // In the side gutter (md:px-12), shown while the row is hovered or an arrow has focus.
  const arrow = 'absolute top-1/2 z-20 hidden -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 md:grid'

  return (
    <section className="group/row">
      <div className="flex items-end justify-between px-4 md:px-12">
        <h2 className="text-lg font-bold md:text-[1.4rem]">{title}</h2>
        {pages.count > 1 && (
          <div className="mb-1 hidden gap-0.5 opacity-0 transition group-hover/row:opacity-100 md:flex" aria-hidden="true">
            {Array.from({ length: pages.count }, (_, i) => (
              <span key={i} className={`h-0.5 w-3 ${i === pages.current ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        {!pages.atStart && (
          <ArrowButton direction="left" label={t.browse.scrollLeft} onClick={() => page(-1)} className={`${arrow} left-1`} />
        )}
        <div
          ref={scroller}
          onScroll={measure}
          className={`no-scrollbar flex snap-x overflow-x-auto scroll-px-4 px-4 py-4 md:scroll-px-12 md:px-12 ${
            row.layout === 'top10' ? 'gap-3' : 'gap-1.5'
          }`}
        >
          {row.items.map((card, i) =>
            row.layout === 'top10' ? (
              <RankCard key={card.titleId} card={card} rank={i + 1} />
            ) : row.layout === 'poster' ? (
              <PosterCard key={card.titleId} card={card} />
            ) : (
              <BackdropCard key={card.titleId} card={card} rowKey={row.key} />
            ),
          )}
        </div>
        {!pages.atEnd && (
          <ArrowButton direction="right" label={t.browse.scrollRight} onClick={() => page(1)} className={`${arrow} right-1`} />
        )}
      </div>
    </section>
  )
}
