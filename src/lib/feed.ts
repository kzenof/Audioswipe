import type { GenreTag, RadarFilters, Track, TrackSource } from '../types'

const FEED_KEY = 'signal_feed_v2'
const DB_NAME = 'signal_audio_db'
const STORE = 'audio'

type FeedTrack = Omit<Track, 'audioUrl'>

function norm(id: string) {
  return id.trim().toLowerCase()
}

function readMeta(): FeedTrack[] {
  try {
    const raw = localStorage.getItem(FEED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FeedTrack[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeMeta(tracks: FeedTrack[]) {
  localStorage.setItem(FEED_KEY, JSON.stringify(tracks))
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putAudio(id: string, blob: Blob) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAudio(id: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) ?? null)
    req.onerror = () => reject(req.error)
  })
}

function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 40
      URL.revokeObjectURL(url)
      resolve(Math.max(5, Math.min(d, 180)))
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(40)
    }
    audio.src = url
  })
}

export async function publishToFeed(track: Track, file: File): Promise<Track> {
  const duration = await probeDuration(file)
  await putAudio(track.id, file)

  const meta: FeedTrack = {
    ...track,
    duration,
    hasAudio: true,
    source: 'soundlink',
    monthlyListeners: 0,
  }
  delete (meta as Track).audioUrl
  const feed = readMeta().filter((t) => t.id !== track.id)
  feed.unshift(meta)
  writeMeta(feed)

  return { ...meta, audioUrl: URL.createObjectURL(file) }
}

export async function loadFeedTracks(): Promise<Track[]> {
  const meta = readMeta()
  const hydrated: Track[] = []
  for (const t of meta) {
    const base: Track = {
      ...t,
      source: 'soundlink',
      monthlyListeners: 0,
      genreTags: t.genreTags?.length ? t.genreTags : (['Рэп'] as GenreTag[]),
    }
    if (!t.hasAudio) {
      hydrated.push(base)
      continue
    }
    try {
      const blob = await getAudio(t.id)
      if (blob) hydrated.push({ ...base, audioUrl: URL.createObjectURL(blob) })
      else hydrated.push({ ...base, hasAudio: false })
    } catch {
      hydrated.push({ ...base, hasAudio: false })
    }
  }
  return hydrated
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function matchesGenre(track: Track, genres: GenreTag[]) {
  if (genres.length === 0) return true
  return track.genreTags.some((g) => genres.includes(g))
}

/**
 * Очередь слушателя:
 * - local = только чужие SoundLink
 * - yandex-тиры собираются отдельно через fetchYandexRadarTracks (JSON API)
 */
export function buildLocalQueue(
  feed: Track[],
  genres: GenreTag[],
  listenerLogin: string | null,
): Track[] {
  const me = listenerLogin ? norm(listenerLogin) : null
  return shuffle(
    feed.filter(
      (t) =>
        t.source === 'soundlink' &&
        (!me || norm(t.artistId) !== me) &&
        matchesGenre(t, genres),
    ),
  )
}

export function pickLocalTracks(
  feed: Track[],
  genres: GenreTag[],
  listenerLogin: string | null,
  count: number,
  excludeIds: Set<string>,
  blockedArtistIds: Set<string> = new Set(),
): Track[] {
  const pool = buildLocalQueue(feed, genres, listenerLogin).filter(
    (t) => !excludeIds.has(t.id) && !blockedArtistIds.has(t.artistId),
  )
  if (pool.length >= count) return pool.slice(0, count)

  if (excludeIds.size > 0) {
    const fresh = buildLocalQueue(feed, genres, listenerLogin)
      .filter((t) => !blockedArtistIds.has(t.artistId))
      .slice(0, count)
    if (fresh.length) return fresh
  }

  return pool
}

/** @deprecated use pickLocalTracks + fetchYandexRadarTracks */
export function buildFilteredQueue(
  feed: Track[],
  filters: RadarFilters,
  listenerLogin: string | null,
): Track[] {
  if (filters.popularity === 'local') {
    return buildLocalQueue(feed, filters.genres, listenerLogin)
  }
  return []
}

export function defaultRadar(): RadarFilters {
  return { popularity: 'freshmen', genres: [] }
}

export type { TrackSource }
