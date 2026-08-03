import type { Track } from '../types'
import { apiBlockArtist, apiGetBlacklist } from './api'

/** Кэш чёрного списка в памяти (синхронизация с SQL через API) */
let cachedIds: string[] = []
let cacheToken: string | null = null

export function setBlacklistCache(ids: string[], token: string | null) {
  cachedIds = ids
  cacheToken = token
}

export function clearBlacklistCache() {
  cachedIds = []
  cacheToken = null
}

export async function loadBlacklistFromApi(token: string): Promise<string[]> {
  const { yandexArtistIds } = await apiGetBlacklist(token)
  setBlacklistCache(yandexArtistIds, token)
  return yandexArtistIds
}

export function getBlacklist(_login: string | null): string[] {
  return cachedIds
}

export async function blockArtist(artistId: string, _login: string): Promise<string[]> {
  if (!cacheToken) {
    throw new Error('Нет токена авторизации')
  }
  const { yandexArtistIds } = await apiBlockArtist(cacheToken, artistId)
  cachedIds = yandexArtistIds
  return yandexArtistIds
}

export function isArtistBlocked(artistId: string, login: string | null): boolean {
  if (!login) return false
  return cachedIds.includes(artistId)
}

export function filterBlockedTracks(tracks: Track[], login: string | null): Track[] {
  if (!login || cachedIds.length === 0) return tracks
  const blacklist = new Set(cachedIds)
  return tracks.filter((track) => !blacklist.has(track.artistId))
}
