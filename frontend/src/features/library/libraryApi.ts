import type { Rating } from '../browse/browseApi'
import { http } from '../../services/http'

// The current profile's own lists (the profile comes from the access token).

export async function setInMyList(titleId: number, inList: boolean): Promise<void> {
  if (inList) await http.put(`/api/my-list/${titleId}`)
  else await http.delete(`/api/my-list/${titleId}`)
}

export async function setRating(titleId: number, rating: Rating | null): Promise<void> {
  await http.put(`/api/ratings/${titleId}`, { rating })
}

/** "Remove from Continue watching": forgets the position in the whole title. */
export async function removeProgress(titleId: number): Promise<void> {
  await http.delete(`/api/progress/${titleId}`)
}
