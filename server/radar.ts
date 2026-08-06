import { listBlacklist } from './blacklist.js'

const YM_BASE = 'https://api.music.yandex.net'
const YM_CLIENT = process.env.YANDEX_CLIENT ?? 'YandexMusicAndroid/2026'

type PopularityTier =
  | 'deep_underground'
  | 'freshmen'
  | 'indie'
  | 'popular'
  | 'hitmakers'
  | 'stadium'
  | 'local'

type GenreTag = 'Рэп' | 'Фонк' | 'Поп' | 'Рок' | 'Электроника' | 'Инди'

export interface RadarTrack {
  id: string
  title: string
  artistId: string
  artistName: string
  avatar: string
  genre: string
  genreTags: GenreTag[]
  duration: number
  skipCurve: number[]
  openToCollab: boolean
  streaming: { yandex?: string }
  waveSeed: number
  source: 'yandex'
  monthlyListeners: number
  yandexTrackId: string
  yandexAlbumId?: string
}

interface YmArtist {
  id?: number | string
  name?: string
  cover?: { uri?: string }
}

interface YmTrack {
  id?: string | number
  title?: string
  durationMs?: number
  coverUri?: string
  artists?: YmArtist[]
  albums?: Array<{ id?: number | string }>
  previewDurationMs?: number
}

const GENRE_QUERY: Record<GenreTag, string> = {
  Рэп: 'русский рэп',
  Фонк: 'phonk',
  Поп: 'поп хиты',
  Рок: 'русский рок',
  Электроника: 'электронная музыка',
  Инди: 'инди',
}

const TIER_RANGE: Record<
  Exclude<PopularityTier, 'local'>,
  { min: number; max: number }
> = {
  deep_underground: { min: 0, max: 4_999 },
  freshmen: { min: 5_000, max: 49_999 },
  indie: { min: 50_000, max: 299_999 },
  popular: { min: 300_000, max: 999_999 },
  hitmakers: { min: 1_000_000, max: 4_999_999 },
  stadium: { min: 5_000_000, max: Number.POSITIVE_INFINITY },
}

const listenersCache = new Map<string, number>()

function ymHeaders() {
  const raw = process.env.YANDEX_MUSIC_TOKEN?.trim() ?? process.env.YANDEX_TOKEN?.trim()
  const token = raw?.startsWith('OAuth ') ? raw.slice(6) : raw
  return {
    Accept: 'application/json',
    'X-Yandex-Music-Client': YM_CLIENT,
    ...(token ? { Authorization: `OAuth ${token}` } : {}),
  }
}

async function ymGet<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${YM_BASE}${path}`, {
      headers: ymHeaders(),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      throw new Error(`Yandex API ${res.status}: ${path}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function coverUrl(uri?: string, size = '200x200') {
  if (!uri) return ''
  const path = uri.replace('%%', size)
  return path.startsWith('http') ? path : `https://${path}`
}

function matchesTier(listeners: number, tier: Exclude<PopularityTier, 'local'>) {
  const { min, max } = TIER_RANGE[tier]
  return listeners >= min && listeners <= max
}

async function fetchArtistMonthListeners(artistId: string): Promise<number> {
  if (listenersCache.has(artistId)) return listenersCache.get(artistId)!
  try {
    const data = await ymGet<{ result?: { stats?: { lastMonthListeners?: number } } }>(
      `/artists/${artistId}/brief-info`,
      8000,
    )
    const n = Number(data.result?.stats?.lastMonthListeners ?? 0)
    const safe = Number.isFinite(n) ? n : 0
    listenersCache.set(artistId, safe)
    return safe
  } catch {
    listenersCache.set(artistId, -1)
    return -1
  }
}

function mapYmTrack(
  raw: YmTrack,
  genreTags: GenreTag[],
  monthlyListeners: number,
): RadarTrack | null {
  if (!raw?.id || !raw.title) return null
  const id = String(raw.id)
  const artistName =
    raw.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Unknown'
  const artistId = String(raw.artists?.[0]?.id ?? `ym-a-${id}`)
  const albumId = raw.albums?.[0]?.id
  const cover =
    coverUrl(raw.coverUri) ||
    coverUrl(raw.artists?.[0]?.cover?.uri) ||
    `https://api.dicebear.com/9.x/shapes/svg?seed=${id}&backgroundColor=0a0a12`

  const durationSec = Math.max(
    20,
    Math.round((raw.previewDurationMs || Math.min(raw.durationMs || 40_000, 45_000)) / 1000),
  )

  return {
    id: `ym-${id}`,
    title: raw.title,
    artistId,
    artistName,
    avatar: cover,
    genre: genreTags[0] || 'Яндекс',
    genreTags: genreTags.length ? genreTags : (['Поп'] as GenreTag[]),
    duration: durationSec,
    skipCurve: [],
    openToCollab: false,
    streaming: {
      yandex: albumId
        ? `https://music.yandex.ru/album/${albumId}/track/${id}`
        : `https://music.yandex.ru/track/${id}`,
    },
    waveSeed: (Number(id) % 29) + 1,
    source: 'yandex',
    monthlyListeners,
    yandexTrackId: id,
    yandexAlbumId: albumId != null ? String(albumId) : undefined,
  }
}

async function fetchWaveTracks(): Promise<YmTrack[]> {
  const data = await ymGet<{
    result?: { sequence?: Array<{ track?: YmTrack }> }
  }>('/rotor/station/user:onyourwave/tracks?settings2=true')
  return (data.result?.sequence ?? [])
    .map((row) => row.track)
    .filter((t): t is YmTrack => Boolean(t?.id))
}

async function searchYandexTracks(text: string, page = 0): Promise<YmTrack[]> {
  const q = encodeURIComponent(text)
  const data = await ymGet<{
    result?: { tracks?: { results?: YmTrack[] } }
  }>(`/search?text=${q}&type=track&page=${page}&pageSize=20`)
  return data.result?.tracks?.results ?? []
}

async function fetchYandexChartTracks(): Promise<YmTrack[]> {
  const data = await ymGet<{
    result?: { chart?: { tracks?: Array<{ track?: YmTrack }> } }
  }>('/landing3/chart')
  return (data.result?.chart?.tracks ?? [])
    .map((row) => row.track)
    .filter((t): t is YmTrack => Boolean(t?.id))
}

async function mapWithListeners(
  raw: YmTrack,
  genreTags: GenreTag[],
  tier: Exclude<PopularityTier, 'local'>,
): Promise<RadarTrack | null> {
  const artistId = raw.artists?.[0]?.id
  if (artistId == null) return null
  const listeners = await fetchArtistMonthListeners(String(artistId))
  if (listeners < 0) return null
  if (!matchesTier(listeners, tier)) return null
  return mapYmTrack(raw, genreTags, listeners)
}

async function filterByTier(
  candidates: Array<{ track: YmTrack; genres: GenreTag[] }>,
  tier: Exclude<PopularityTier, 'local'>,
  limit: number,
  blockedArtistIds: Set<string>,
): Promise<RadarTrack[]> {
  const out: RadarTrack[] = []
  const seen = new Set<string>()
  const concurrency = 6
  let i = 0

  while (i < candidates.length && out.length < limit) {
    const chunk = candidates.slice(i, i + concurrency)
    i += concurrency
    const mapped = await Promise.all(
      chunk.map(({ track, genres }) => mapWithListeners(track, genres, tier)),
    )
    for (const t of mapped) {
      if (!t || seen.has(t.id) || blockedArtistIds.has(t.artistId)) continue
      seen.add(t.id)
      out.push(t)
      if (out.length >= limit) break
    }
  }
  return out
}

function parseGenres(raw: unknown): GenreTag[] {
  const allowed: GenreTag[] = ['Рэп', 'Фонк', 'Поп', 'Рок', 'Электроника', 'Инди']
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split(',')
    .map((g) => g.trim())
    .filter((g): g is GenreTag => (allowed as string[]).includes(g))
}

function parseExclude(raw: unknown): Set<string> {
  if (typeof raw !== 'string' || !raw.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

export async function getRadarTracks(input: {
  userId: number | null
  tier: PopularityTier
  genres: GenreTag[]
  limit: number
  excludeIds: Set<string>
}): Promise<{ success: true; tracks: RadarTrack[] } | { success: false; error: string }> {
  const { tier, genres, limit, excludeIds } = input
  if (tier === 'local') {
    return { success: true, tracks: [] }
  }

  const token =
    process.env.YANDEX_MUSIC_TOKEN?.trim() ?? process.env.YANDEX_TOKEN?.trim()
  if (!token) {
    return {
      success: false,
      error: 'YANDEX_MUSIC_TOKEN не задан на сервере (Vercel → Environment Variables)',
    }
  }

  let blockedIds: string[] = []
  if (input.userId != null) {
    try {
      blockedIds = await listBlacklist(input.userId)
    } catch {
      blockedIds = []
    }
  }
  const blocked = new Set(blockedIds)

  const excludeYm = new Set<string>()
  for (const id of excludeIds) {
    if (id.startsWith('ym-')) excludeYm.add(id.slice(3))
  }

  const candidates: Array<{ track: YmTrack; genres: GenreTag[] }> = []
  const seenTrack = new Set<string>(excludeYm)

  const add = (track: YmTrack, g: GenreTag[]) => {
    const id = String(track.id ?? '')
    const artistId = String(track.artists?.[0]?.id ?? '')
    if (!id || seenTrack.has(id)) return
    if (artistId && blocked.has(artistId)) return
    seenTrack.add(id)
    candidates.push({ track, genres: g })
  }

  try {
    const wave = await fetchWaveTracks()
    for (const t of wave) add(t, genres.length ? genres : (['Поп'] as GenreTag[]))
  } catch (e) {
    console.warn('wave fetch failed', e)
  }

  if (candidates.length < limit * 2) {
    try {
      const chart = await fetchYandexChartTracks()
      for (const t of chart) add(t, ['Поп'])
    } catch (e) {
      console.warn('chart fetch failed', e)
    }
  }

  const searchGenres = genres.length ? genres : (['Поп', 'Рэп'] as GenreTag[])
  for (const g of searchGenres) {
    if (candidates.length >= limit * 4) break
    try {
      const found = await searchYandexTracks(GENRE_QUERY[g], 0)
      for (const t of found) add(t, [g])
    } catch (e) {
      console.warn('search failed', g, e)
    }
  }

  if (candidates.length === 0) {
    return { success: false, error: 'Яндекс не вернул треки для радара' }
  }

  const sliced = candidates.slice(0, Math.max(limit * 4, 24))
  const tracks = await filterByTier(
    sliced,
    tier as Exclude<PopularityTier, 'local'>,
    limit,
    blocked,
  )

  if (tracks.length === 0) {
    return {
      success: false,
      error: 'По фильтру слушателей треков не нашлось — смени тир или жанр',
    }
  }

  return { success: true, tracks }
}

export function normalizeRadarTier(raw: unknown): PopularityTier {
  const known: PopularityTier[] = [
    'deep_underground',
    'freshmen',
    'indie',
    'popular',
    'hitmakers',
    'stadium',
    'local',
  ]
  const s = String(raw ?? 'freshmen')
  return (known as string[]).includes(s) ? (s as PopularityTier) : 'freshmen'
}

export { parseGenres, parseExclude }
