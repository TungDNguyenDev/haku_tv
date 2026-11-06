import axios from 'axios'

// Same-origin in dev: Vite proxies /api and /media to the backend (see vite.config.ts).
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  timeout: 15_000,
})
