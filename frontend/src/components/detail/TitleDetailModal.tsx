import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectLanguage } from '../../features/auth/authSlice'
import type { Rating } from '../../features/browse/browseApi'
import { myListChanged, ratingChanged } from '../../features/browse/browseSlice'
import { formatMaturity, formatRuntime, formatVote, placeholderStyle } from '../../features/browse/format'
import { toCard, type Episode, type PersonCredit, type SimilarTitle, type TitleDetail } from '../../features/detail/detailApi'
import { useDetailNavigation } from '../../features/detail/detailRoute'
import { detailClosed, detailRequested, seasonSelected } from '../../features/detail/detailSlice'
import { useT, type Messages } from '../../i18n'
import { tmdbImage } from '../../services/tmdbImage'
import { RateButton, RoundButton } from '../browse/TitleActions'
import { CheckIcon, CloseIcon, PlayIcon, PlusIcon } from '../icons'
import Select from '../Select'

/*
  Detail modal over the browse page (/browse?title=123): Play / Resume, My List, rating, overview and credits, the
  episodes of a series by season, "More like this", and the full credits at the bottom.
  Escape, the close button, a click outside it and the browser's Back button all close it.
*/

export default function TitleDetailModal({ titleId }: { titleId: number }) {
  const dispatch = useAppDispatch()
  const lang = useAppSelector(selectLanguage)
  const { status, detail, error } = useAppSelector((s) => s.detail)
  const { close } = useDetailNavigation()
  const t = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dispatch(detailRequested({ titleId, lang }))
    scroller.current?.scrollTo({ top: 0 }) // a "More like this" title replaces the current one: start at its top
  }, [titleId, lang, dispatch])

  useEffect(() => {
    dialog.current?.focus()
    return () => {
      dispatch(detailClosed())
    }
  }, [dispatch])

  // The page behind must not scroll with the modal.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const shown = detail?.titleId === titleId ? detail : null

  return createPortal(
    <div
      ref={scroller}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={shown?.name ?? t.common.loading}
        tabIndex={-1}
        className="preview-in relative mx-auto min-h-screen w-full max-w-[880px] overflow-hidden bg-surface shadow-2xl shadow-black outline-none md:my-8 md:min-h-0 md:rounded-lg"
      >
        <button
          type="button"
          onClick={close}
          aria-label={t.detail.close}
          title={t.detail.close}
          className="absolute top-3 right-3 z-20 grid size-9 place-items-center rounded-full bg-black/70 hover:bg-black"
        >
          <CloseIcon />
        </button>

        {shown ? (
          <DetailContent key={shown.titleId} detail={shown} />
        ) : status === 'failed' ? (
          <p className="px-8 pt-20 pb-24 text-center text-lg">
            {error === 'title-not-found' ? t.detail.notFound : t.detail.loadFailed}
          </p>
        ) : (
          <DetailSkeleton />
        )}
      </div>
    </div>,
    document.body,
  )
}

function DetailContent({ detail }: { detail: TitleDetail }) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const t = useT()
  const [allCast, setAllCast] = useState(false)

  const backdrop = tmdbImage(detail.backdropPath, 'w1280')
  const logo = tmdbImage(detail.logoPath, 'w500')
  const resume = detail.resume
  const isSeries = detail.titleType === 2

  const playLabel = resume
    ? resume.seasonNumber !== null && resume.episodeNumber !== null
      ? `${t.detail.resume} ${t.title.resumeEpisode(resume.seasonNumber, resume.episodeNumber)}`
      : t.detail.resume
    : t.title.play
  const toggleList = () => dispatch(myListChanged({ card: toCard(detail), inList: !detail.inMyList }))
  const rate = (rating: Rating | null) => dispatch(ratingChanged({ titleId: detail.titleId, rating, previous: detail.myRating }))

  return (
    <>
      <div className="relative aspect-video w-full">
        {backdrop ? (
          <img src={backdrop} alt="" className="size-full object-cover" />
        ) : (
          <div className="size-full" style={placeholderStyle(detail.titleId)} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-surface via-surface/40 to-transparent" />

        <div className="absolute bottom-[7%] left-5 w-[70%] md:left-12 md:w-[55%]">
          {logo ? (
            <img src={logo} alt={detail.name} className="mb-4 max-h-16 w-auto max-w-full object-contain object-left-bottom drop-shadow-lg sm:max-h-24 md:mb-6 md:max-h-32" />
          ) : (
            <h2 className="mb-4 text-2xl leading-tight font-black drop-shadow-lg md:mb-6 md:text-5xl">{detail.name}</h2>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!detail.hasVideo}
              onClick={() => navigate(`/watch/${detail.titleId}`)}
              className="flex items-center gap-2 rounded bg-white px-4 py-1.5 font-semibold whitespace-nowrap text-black hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50 md:px-7 md:py-2 md:text-lg"
            >
              <PlayIcon className="size-5 md:size-7" />
              {detail.hasVideo ? playLabel : t.detail.noVideo}
            </button>
            <RoundButton size="lg" label={detail.inMyList ? t.title.removeFromList : t.title.addToList} onClick={toggleList}>
              {detail.inMyList ? <CheckIcon /> : <PlusIcon />}
            </RoundButton>
            <RateButton size="lg" rating={detail.myRating} onRate={rate} />
          </div>
        </div>
      </div>

      <div className="px-5 pb-10 md:px-12">
        <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-8">
          <div className="space-y-3">
            <MetaLine detail={detail} />
            {resume && resume.episodeId === null && resume.durationSeconds > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <ProgressBar percent={(100 * resume.positionSeconds) / resume.durationSeconds} className="max-w-56 flex-1" />
                <span className="text-muted">
                  {t.detail.timeLeft(Math.max(1, Math.round((resume.durationSeconds - resume.positionSeconds) / 60)))}
                </span>
              </div>
            )}
            {detail.tagline && <p className="text-white/70 italic">{detail.tagline}</p>}
            {detail.overview && <p className="leading-relaxed">{detail.overview}</p>}
          </div>

          <div className="space-y-3 text-sm">
            {detail.cast.length > 0 && (
              <Field label={t.detail.cast}>
                {names(allCast ? detail.cast : detail.cast.slice(0, 3))}
                {/* "more" opens the whole cast list (up to 10) in place. */}
                {!allCast && detail.cast.length > 3 && (
                  <>
                    ,{' '}
                    <button type="button" onClick={() => setAllCast(true)} className="italic hover:underline">
                      {t.detail.more}
                    </button>
                  </>
                )}
              </Field>
            )}
            {detail.genres.length > 0 && <Field label={t.detail.genres}>{genreNames(detail)}</Field>}
            {detail.creators.length > 0 && <Field label={t.detail.creators}>{names(detail.creators)}</Field>}
            {detail.directors.length > 0 && <Field label={t.detail.directors}>{names(detail.directors)}</Field>}
          </div>
        </div>

        {isSeries && detail.seasons.length > 0 && <EpisodeSection detail={detail} />}

        {detail.similar.length > 0 && (
          <section className="mt-10">
            <h3 className="mb-4 text-2xl font-bold">{t.detail.moreLikeThis}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
              {detail.similar.map((s) => (
                <SimilarCard key={s.titleId} title={s} />
              ))}
            </div>
          </section>
        )}

      </div>
    </>
  )
}

function MetaLine({ detail }: { detail: TitleDetail }) {
  const t = useT()
  const vote = formatVote(detail.voteAverage)
  const age = formatMaturity(detail.maturityAge, t)
  const length = detail.titleType === 2 ? (detail.seasonCount > 0 ? t.detail.seasonCount(detail.seasonCount) : null) : formatRuntime(detail.runtimeMinutes, t)
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {detail.isRecent && <span className="font-semibold text-green-400">{t.title.isNew}</span>}
      {vote && <span className="font-semibold text-green-400">★ {vote}</span>}
      {detail.releaseYear && <span className="text-white/80">{detail.releaseYear}</span>}
      {age && <span className="border border-white/50 px-1.5 text-sm leading-tight">{age}</span>}
      {length && <span className="text-white/80">{length}</span>}
      <span className="rounded-sm border border-white/40 px-1 text-[10px] leading-tight font-semibold text-muted">HD</span>
    </div>
  )
}

function EpisodeSection({ detail }: { detail: TitleDetail }) {
  const dispatch = useAppDispatch()
  const lang = useAppSelector(selectLanguage)
  const { season, episodes, seasonStatus } = useAppSelector((s) => s.detail)
  const t = useT()
  const list = season === null ? undefined : episodes[season]
  const current = detail.seasons.find((s) => s.seasonNumber === season)

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t.detail.episodes}</h3>
        {detail.seasons.length > 1 ? (
          <Select
            value={season ?? detail.seasons[0].seasonNumber}
            aria-label={t.detail.episodes}
            align="end"
            options={detail.seasons.map((s) => ({
              value: s.seasonNumber,
              label: `${t.detail.season(s.seasonNumber)} (${t.detail.episodeCount(s.episodeCount)})`,
            }))}
            onChange={(seasonNumber) => dispatch(seasonSelected({ titleId: detail.titleId, seasonNumber, lang }))}
            className="min-w-44"
            triggerClassName="border-white/30 bg-surface-raised font-semibold hover:border-white/60"
          />
        ) : (
          current && <span className="text-lg">{t.detail.season(current.seasonNumber)}</span>
        )}
      </div>

      {seasonStatus === 'failed' ? (
        <p className="py-6 text-center text-muted">{t.detail.seasonFailed}</p>
      ) : seasonStatus === 'loading' || !list ? (
        <div className="space-y-2" aria-label={t.common.loading}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded bg-surface-raised" />
          ))}
        </div>
      ) : (
        <ol className="divide-y divide-white/10 border-y border-white/10">
          {list.map((e) => (
            <EpisodeRow key={e.episodeId} titleId={detail.titleId} episode={e} isResume={detail.resume?.episodeId === e.episodeId} t={t} />
          ))}
        </ol>
      )}
    </section>
  )
}

function EpisodeRow({ titleId, episode, isResume, t }: { titleId: number; episode: Episode; isResume: boolean; t: Messages }) {
  const navigate = useNavigate()
  const still = tmdbImage(episode.stillPath, 'w300')
  const name = episode.name ?? t.detail.episode(episode.episodeNumber)
  return (
    <li>
      <button
        type="button"
        disabled={!episode.hasVideo}
        onClick={() => navigate(`/watch/${titleId}?episode=${episode.episodeId}`)}
        aria-label={`${t.detail.episode(episode.episodeNumber)}: ${name}`}
        className={`group flex w-full items-center gap-3 rounded-md px-2 py-4 text-left transition md:gap-5 md:px-4 ${
          isResume ? 'bg-white/10' : 'hover:bg-white/5'
        } disabled:cursor-default disabled:opacity-60`}
      >
        <span className="hidden w-7 shrink-0 text-center text-2xl text-white/60 sm:block">{episode.episodeNumber}</span>
        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded bg-surface-raised md:w-40">
          {still ? (
            <img src={still} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <div className="size-full" style={placeholderStyle(episode.episodeId)} />
          )}
          {episode.hasVideo && (
            <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="grid size-10 place-items-center rounded-full border-2 border-white bg-black/50">
                <PlayIcon className="size-5" />
              </span>
            </span>
          )}
          {episode.progressPercent !== null && (
            <ProgressBar percent={episode.progressPercent} className="absolute inset-x-0 bottom-0" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-semibold">
              <span className="sm:hidden">{episode.episodeNumber}. </span>
              {name}
            </p>
            {episode.runtimeMinutes && <span className="shrink-0 text-sm text-white/70">{t.detail.minutes(episode.runtimeMinutes)}</span>}
          </div>
          {episode.overview && <p className="mt-1 line-clamp-3 text-sm text-white/70">{episode.overview}</p>}
          {!episode.hasVideo && <p className="mt-1 text-xs text-muted">{t.detail.noVideo}</p>}
        </div>
      </button>
    </li>
  )
}

function SimilarCard({ title }: { title: SimilarTitle }) {
  const dispatch = useAppDispatch()
  const { open } = useDetailNavigation()
  const t = useT()
  const backdrop = tmdbImage(title.backdropPath, 'w500')
  const logo = tmdbImage(title.logoPath, 'w300')
  const age = formatMaturity(title.maturityAge, t)
  const length = title.titleType === 2 ? (title.seasonCount > 0 ? t.detail.seasonCount(title.seasonCount) : null) : formatRuntime(title.runtimeMinutes, t)
  const toggleList = () => dispatch(myListChanged({ card: toCard(title), inList: !title.inMyList }))

  return (
    // A click anywhere on the card switches the modal to that title; the image is also a button for keyboard users.
    <div onClick={() => open(title.titleId)} className="cursor-pointer overflow-hidden rounded-md bg-surface-raised">
      <button type="button" aria-label={title.name} className="relative block aspect-video w-full">
        {backdrop ? (
          <img src={backdrop} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="size-full" style={placeholderStyle(title.titleId)} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 to-transparent" />
        {logo ? (
          <img src={logo} alt="" loading="lazy" className="absolute bottom-[8%] left-[6%] max-h-[40%] max-w-[60%] object-contain object-left-bottom drop-shadow-lg" />
        ) : (
          <p className="absolute bottom-[8%] left-[6%] line-clamp-2 max-w-[85%] text-left text-sm font-bold drop-shadow">{title.name}</p>
        )}
        {length && <span className="absolute top-2 right-2 rounded-sm bg-black/60 px-1.5 text-xs font-semibold">{length}</span>}
      </button>
      <div className="p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {age && <span className="border border-white/50 px-1.5 text-xs leading-tight">{age}</span>}
            {title.releaseYear && <span className="text-white/80">{title.releaseYear}</span>}
          </div>
          {/* Stops the click here, so adding to My List does not also switch the modal. */}
          <div onClick={(e) => e.stopPropagation()}>
            <RoundButton label={title.inMyList ? t.title.removeFromList : t.title.addToList} onClick={toggleList}>
              {title.inMyList ? <CheckIcon /> : <PlusIcon />}
            </RoundButton>
          </div>
        </div>
        {title.overview && <p className="mt-2 line-clamp-4 text-sm text-white/70">{title.overview}</p>}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p>
      <span className="text-white/50">{label}: </span>
      {children}
    </p>
  )
}

function ProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <div className={`h-1 bg-white/30 ${className}`} aria-hidden="true">
      <div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

const names = (people: PersonCredit[]) => people.map((p) => p.name).join(', ')
const genreNames = (detail: TitleDetail) => detail.genres.map((g) => g.name.replace(/^Phim /, '')).join(', ')

function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video bg-surface-raised" />
      <div className="space-y-3 px-5 py-6 md:px-12">
        <div className="h-4 w-1/3 rounded bg-surface-raised" />
        <div className="h-4 w-full rounded bg-surface-raised" />
        <div className="h-4 w-5/6 rounded bg-surface-raised" />
      </div>
    </div>
  )
}
