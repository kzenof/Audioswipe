const API_BASE =
  import.meta.env.VITE_API_URL ?? 'https://audioswipe.onrender.com/api'

const API_TIMEOUT_MS = 90_000

export interface ApiUser {
  id: number
  email: string
  role: 'listener' | 'artist'
  artistName: string | null
  mainRole: string | null
  dawSoftware: string | null
  statusTag: string | null
  createdAt: string
}

async function apiFetch(input: string, init?: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error(
        'Сервер не ответил вовремя. На Render free tier первый запуск может занять до минуты — подожди и попробуй снова.',
      )
    }
    throw new Error(
      'Не удалось связаться с сервером. Проверь, что бэкенд на Render запущен.',
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return data
}

export async function apiRegister(body: {
  login: string
  password: string
  role: 'listener' | 'artist'
  artistName?: string
}) {
  return parseJson<{ token: string; user: ApiUser }>(
    await apiFetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function apiLogin(login: string, password: string) {
  return parseJson<{ token: string; user: ApiUser }>(
    await apiFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }),
  )
}

export async function apiMe(token: string) {
  return parseJson<{ user: ApiUser }>(
    await apiFetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}

export async function apiGetBlacklist(token: string) {
  return parseJson<{ yandexArtistIds: string[] }>(
    await apiFetch(`${API_BASE}/blacklist`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}

export async function apiBlockArtist(token: string, yandexArtistId: string) {
  return parseJson<{ yandexArtistIds: string[] }>(
    await apiFetch(`${API_BASE}/blacklist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ yandexArtistId }),
    }),
  )
}
