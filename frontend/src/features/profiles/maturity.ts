import type { MaturityLimit } from '../auth/authApi'

export interface MaturityOption {
  value: MaturityLimit
  label: string
}

// Choices offered in the profile editor. They map to identity.Profile.MaturityLimit (CK: 7, 13, 16 or NULL);
// SQL turns them into MaxMaturityAge (Kids: 12, or 7 for little kids).
export const ADULT_MATURITY_OPTIONS: MaturityOption[] = [
  { value: null, label: 'Mọi độ tuổi (cả phim 18+)' },
  { value: 16, label: 'Đến 16+' },
  { value: 13, label: 'Đến 13+' },
  { value: 7, label: 'Đến 7+' },
]

export const KIDS_MATURITY_OPTIONS: MaturityOption[] = [
  { value: null, label: 'Trẻ em (đến 12 tuổi)' },
  { value: 7, label: 'Trẻ nhỏ (đến 7 tuổi)' },
]

export function maturityLabel(isKids: boolean, limit: MaturityLimit): string {
  const options = isKids ? KIDS_MATURITY_OPTIONS : ADULT_MATURITY_OPTIONS
  return options.find((o) => o.value === limit)?.label ?? options[0].label
}
