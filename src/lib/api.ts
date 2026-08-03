const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

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
    await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function apiLogin(login: string, password: string) {
  return parseJson<{ token: string; user: ApiUser }>(
    await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }),
  )
}

export async function apiMe(token: string) {
  return parseJson<{ user: ApiUser }>(
    await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}

export async function apiGetBlacklist(token: string) {
  return parseJson<{ yandexArtistIds: string[] }>(
    await fetch(`${API_BASE}/blacklist`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
}

export async function apiBlockArtist(token: string, yandexArtistId: string) {
  return parseJson<{ yandexArtistIds: string[] }>(
    await fetch(`${API_BASE}/blacklist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ yandexArtistId }),
    }),
  )
}
