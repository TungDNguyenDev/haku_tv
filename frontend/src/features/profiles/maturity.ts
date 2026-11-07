import type { Messages } from '../../i18n'
import type { MaturityLimit } from '../auth/authApi'

// Choices offered in the profile editor. They map to identity.Profile.MaturityLimit (CK: 7, 13, 16 or NULL);
// SQL turns them into MaxMaturityAge (Kids: 12, or 7 for little kids).
export const ADULT_MATURITY_LIMITS: MaturityLimit[] = [null, 16, 13, 7]
export const KIDS_MATURITY_LIMITS: MaturityLimit[] = [null, 7]

export function maturityLabel(t: Messages, isKids: boolean, limit: MaturityLimit): string {
  if (isKids) return limit === 7 ? t.maturity.littleKids : t.maturity.kids
  return limit === null ? t.maturity.all : t.maturity.upTo(limit)
}
