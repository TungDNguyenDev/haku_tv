import axios, { type InternalAxiosRequestConfig } from 'axios'

// Same-origin in dev: Vite proxies /api and /media to the backend (see vite.config.ts), so the refresh cookie
// (path /api/auth, SameSite=Strict) is a first-party cookie and is sent without any CORS credentials setup.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  timeout: 15_000,
})

/*
  Access token handling, kept outside Redux on purpose: axios needs it synchronously for every request.
  The store pushes the current token here (store.ts subscribes), and registers how to get a new one.
*/
let accessToken: string | null = null
let refreshHandler: (() => Promise<string | null>) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setRefreshHandler(handler: () => Promise<string | null>) {
  refreshHandler = handler
}

http.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// A 401 on a normal API call usually means the 15-minute access token just expired (laptop asleep, tab in the
// background). Get a new one from the refresh cookie and replay the request once. Auth endpoints are excluded,
// otherwise a failing refresh would try to refresh itself.
http.interceptors.response.use(undefined, async (error) => {
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !config.url?.startsWith('/api/auth/') &&
    refreshHandler
  ) {
    config._retried = true
    const token = await refreshHandler()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      return http(config)
    }
  }
  throw error
})

/** { code, error } body of the auth/profile endpoints → a code and a message for the UI. */
export function apiError(err: unknown, fallback = 'Đã có lỗi xảy ra, hãy thử lại.'): { code: string; message: string } {
  if (axios.isAxiosError<{ code?: string; error?: string }>(err)) {
    if (err.response?.status === 429 && !err.response.data?.code)
      return { code: 'rate-limited', message: 'Bạn thao tác quá nhanh, hãy thử lại sau ít phút.' }
    if (err.response?.data?.code) return { code: err.response.data.code, message: err.response.data.error ?? fallback }
    if (!err.response) return { code: 'network', message: 'Không kết nối được tới API. API (.NET) đã chạy chưa?' }
  }
  return { code: 'error', message: fallback }
}
