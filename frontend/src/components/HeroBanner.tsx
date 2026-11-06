import { useNavigate } from 'react-router-dom'
import type { HeroTitle } from '../features/browse/browseApi'
import { placeholderStyle } from '../features/browse/format'
import { tmdbImage } from '../services/tmdbImage'
import { InfoIcon, PlayIcon } from './icons'
import TitleMeta from './TitleMeta'

export default function HeroBanner({ hero }: { hero: HeroTitle }) {
  const navigate = useNavigate()
  const backdrop = tmdbImage(hero.backdropPath, 'original')
  const logo = tmdbImage(hero.logoPath, 'w500')

  return (
    <section className="relative h-[56.25vw] max-h-[85vh] min-h-[460px] w-full overflow-hidden">
      {backdrop ? (
        <img src={backdrop} alt="" className="absolute inset-0 size-full object-cover object-top" />
      ) : (
        <div className="absolute inset-0" style={placeholderStyle(hero.titleId)} />
      )}
      {/* Darken the left side for the text, and fade the bottom into the page so the first row can overlap it. */}
      <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-b from-transparent to-surface" />

      <div className="absolute bottom-[24%] left-4 max-w-[90%] md:left-12 md:max-w-xl">
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
            <PlayIcon className="size-5 md:size-7" /> Phát
          </button>
          <button
            type="button"
            disabled
            title="Trang chi tiết có ở Giai đoạn 5"
            className="flex cursor-not-allowed items-center gap-2 rounded bg-gray-500/60 px-5 py-2 font-semibold md:px-7 md:text-lg"
          >
            <InfoIcon className="size-5 md:size-7" /> Thông tin khác
          </button>
        </div>
      </div>
    </section>
  )
}
