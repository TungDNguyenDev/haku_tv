import { formatMaturity, formatVote } from '../features/browse/format'
import { useT } from '../i18n'

interface Props {
  releaseYear: number | null
  maturityAge: number | null
  voteAverage: number | null
  titleType: 1 | 2
  className?: string
}

export default function TitleMeta({ releaseYear, maturityAge, voteAverage, titleType, className = '' }: Props) {
  const t = useT()
  const age = formatMaturity(maturityAge, t)
  const vote = formatVote(voteAverage)
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {vote && <span className="font-semibold text-green-400">★ {vote}</span>}
      {releaseYear && <span>{releaseYear}</span>}
      {age && <span className="border border-white/50 px-1.5 text-[0.8em] leading-tight">{age}</span>}
      <span className="text-muted">{titleType === 2 ? t.title.series : t.title.movie}</span>
    </div>
  )
}
