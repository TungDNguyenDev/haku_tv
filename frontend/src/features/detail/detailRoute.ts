import { useCallback } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

/*
  The detail modal lives in the URL (/browse?title=123), like the real site: it can be shared or reloaded, and the
  browser's Back button closes it. History entries carry `detailModal: true` when the app opened the modal itself,
  so closing knows whether there is a browse page behind it to go back to (a shared link has none).
*/

export const TITLE_PARAM = 'title'

interface ModalState {
  detailModal?: boolean
}

export function detailLink(titleId: number) {
  return { to: { pathname: '/browse', search: `?${TITLE_PARAM}=${titleId}` }, state: { detailModal: true } satisfies ModalState }
}

/** The title whose modal is open, or null. */
export function openTitleId(location: Location): number | null {
  const value = Number(new URLSearchParams(location.search).get(TITLE_PARAM))
  return Number.isInteger(value) && value > 0 ? value : null
}

export function useDetailNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const openedHere = (location.state as ModalState | null)?.detailModal === true

  /** From the page: a new history entry, so Back closes it. Inside the modal ("More like this"): replace the title. */
  const open = useCallback(
    (titleId: number) => {
      const link = detailLink(titleId)
      if (openTitleId(location) === null) navigate(link.to, { state: link.state })
      else navigate(link.to, { replace: true, state: location.state })
    },
    [navigate, location],
  )

  const close = useCallback(() => {
    if (openedHere) navigate(-1)
    else navigate('/browse', { replace: true })
  }, [navigate, openedHere])

  return { open, close }
}
