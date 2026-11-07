import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HeroTitle } from '../features/browse/browseApi'
import { placeholderStyle } from '../features/browse/format'
import { useDetailNavigation } from '../features/detail/detailRoute'
import { useT } from '../i18n'
import { tmdbImage } from '../services/tmdbImage'
import ArrowButton from './ArrowButton'
import { InfoIcon, PlayIcon } from './icons'
import TitleMeta from './TitleMeta'

const SLIDE_SECONDS = 8

// In the side gutter (the text starts at md:left-12), shown while the banner is hovered or an arrow has focus.
const heroArrow = 'absolute top-1/2 z-10 hidden -translate-y-1/2 opacity-0 group-hover/hero:opacity-100 focus-visible:opacity-100 md:grid'

/**
 * Billboard of the home page. Rotates through the newest titles (newest first), one every SLIDE_SECONDS.
 * A page indicator at the bottom centre shows which one is on and jumps to a title when clicked. The rotation
 * pauses while the pointer is on the text and buttons (no title swap under the cursor) and while the detail
 * modal is open; each slide gets its full time again afterwards.
 */
export default function HeroBanner({ heroes, paused = false }: { heroes: HeroTitle[]; paused?: boolean }) {
  const navigate = useNavigate()
  const t = useT()
  const { open: openDetail } = useDetailNavigation()
  const [current, setCurrent] = useState(0)
  const [hovered, setHovered] = useState(false)
  const index = current < heroes.length ? current : 0 // the list can shrink (other profile or language)
  const hero = heroes[index]
  const logo = tmdbImage(hero.logoPath, 'w500')
  const rotating = heroes.length > 1
  const running = rotating && !paused && !hovered

  // One timer per slide: a click on the indicator or a pause restarts it, so a slide is never cut short.
  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => setCurrent((index + 1) % heroes.length), SLIDE_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [running, index, heroes.length])

  return (
    <section
      className="group/hero relative h-[56.25vw] max-h-[85vh] min-h-[460px] w-full overflow-hidden"
      aria-roledescription="carousel"
      aria-label={t.browse.heroLabel}
    >
      {/* Every backdrop stays mounted (already loaded when its turn comes) and cross-fades in. */}
      {heroes.map((h, i) => {
        const backdrop = tmdbImage(h.backdropPath, 'original')
        const fade = `absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none ${i === index ? 'opacity-100' : 'opacity-0'}`
        return backdrop ? (
          <img key={h.titleId} src={backdrop} alt="" className={`${fade} size-full object-cover object-top`} />
        ) : (
          <div key={h.titleId} className={fade} style={placeholderStyle(h.titleId)} />
        )
      })}
      {/* Darken the left side for the text, and fade the bottom into the page so the first row can overlap it. */}
      <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-surface" />

      {rotating && (
        <>
          <ArrowButton
            direction="left"
            label={t.browse.heroPrevious}
            onClick={() => setCurrent((index - 1 + heroes.length) % heroes.length)}
            className={`${heroArrow} left-1`}
          />
          <ArrowButton
            direction="right"
            label={t.browse.heroNext}
            onClick={() => setCurrent((index + 1) % heroes.length)}
            className={`${heroArrow} right-1`}
          />
        </>
      )}

      {rotating && (
        // Above the part of the hero that the first row slides over (-7vw on the page).
        <div className="absolute bottom-[calc(7vw+0.75rem)] left-1/2 z-10 flex -translate-x-1/2 drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)]">
          {heroes.map((h, i) => (
            <button
              key={h.titleId}
              type="button"
              aria-label={t.browse.heroSlide(i + 1, heroes.length, h.name)}
              aria-current={i === index}
              onClick={() => setCurrent(i)}
              className="group px-1 py-2"
            >
              <span
                className={`block h-0.5 w-5 transition-colors md:w-7 ${i === index ? 'bg-white' : 'bg-white/30 group-hover:bg-white/60'}`}
              />
            </button>
          ))}
        </div>
      )}

      <div
        key={hero.titleId}
        className="hero-in absolute bottom-[24%] left-4 max-w-[90%] md:left-12 md:max-w-xl"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        {logo ? (
          <img src={logo} alt={hero.name} className="mb-5 max-h-28 w-auto md:max-h-40" />
        ) : (
          <h1 className="mb-4 text-4xl leading-tight font-black drop-shadow-lg md:text-6xl">{hero.name}</h1>
        )}
        <TitleMeta {...hero} className="mb-3 text-sm md:text-base" />
        {hero.overview && <p className="line-clamp-3 text-sm drop-shadow md:text-lg">{hero.overview}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => navigate(`/watch/${hero.titleId}`)}
            className="flex items-center gap-2 rounded bg-white px-5 py-2 font-semibold text-black hover:bg-white/75 md:px-7 md:text-lg"
          >
            <PlayIcon className="size-5 md:size-7" /> {t.title.play}
          </button>
          <button
            type="button"
            onClick={() => openDetail(hero.titleId)}
            className="flex items-center gap-2 rounded bg-gray-500/60 px-5 py-2 font-semibold hover:bg-gray-500/40 md:px-7 md:text-lg"
          >
            <InfoIcon className="size-5 md:size-7" /> {t.title.moreInfo}
          </button>
        </div>
      </div>
    </section>
  )
}
