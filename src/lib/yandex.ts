import type { GenreTag, PopularityTier, Track } from '../types'

const CLIENT = 'YandexMusicDesktop/24023621'

interface YmArtist {
  id?: number | string
  name?: string
  cover?: { uri?: string }
}

interface YmAlbum {
  id?: number | string
  title?: string
  coverUri?: string
}

interface YmTrack {
  id?: string | number
  title?: string
  durationMs?: number
  coverUri?: string
  artists?: YmArtist[]
  albums?: YmAlbum[]
  previewDurationMs?: number
}

interface YmSearchResponse {
  result?: {
    tracks?: {
      results?: YmTrack[]
    }
  }
}

interface YmChartResponse {
  result?: {
    chart?: {
      tracks?: Array<{ track?: YmTrack; id?: number }>
    }
  }
}

interface YmBriefInfo {
  result?: {
    stats?: {
      lastMonthListeners?: number
    }
  }
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

function coverUrl(uri?: string, size = '200x200') {
  if (!uri) return ''
  const path = uri.replace('%%', size)
  return path.startsWith('http') ? path : `https://${path}`
}

function matchesTier(listeners: number, tier: Exclude<PopularityTier, 'local'>) {
  const { min, max } = TIER_RANGE[tier]
  return listeners >= min && listeners <= max
}

function mapYmTrack(
  raw: YmTrack,
  genreTags: GenreTag[],
  monthlyListeners: number,
): Track | null {
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
    Math.round((raw.previewDurationMs || Math.min(raw.durationMs || 40000, 45000)) / 1000),
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

function ymProxyBase() {
  return (import.meta.env.VITE_YM_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
}

/** Прямой URL Cloud Functions без API Gateway (paths не пробрасываются). */
function isYcFunctionsDirect(base: string) {
  return /functions\.yandexcloud\.net/i.test(base)
}

async function ymGet<T>(path: string, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const base = ymProxyBase()
  try {
    const [pathname, qs = ''] = path.split('?')
    const url = isYcFunctionsDirect(base)
      ? `${base}?path=${encodeURIComponent(pathname)}${qs ? `&${qs}` : ''}`
      : `${base}/ym-api${path}`

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Yandex-Music-Client': CLIENT,
      },
      signal: ctrl.signal,
    })
    const text = await res.text()
    if (res.status === 451 || /Unavailable For Legal Reasons/i.test(text)) {
      throw new Error(
        'Яндекс недоступен с серверов за рубежом (451). Нужен прокси в РФ — см. VITE_YM_BASE',
      )
    }
    if (
      res.status === 403 ||
      /temporarily blocked|доступ временно заблокирован|smart-captcha/i.test(text)
    ) {
      throw new Error(
        'Яндекс временно заблокировал прокси (403). Подожди 30–60 мин и попробуй снова',
      )
    }
    if (!res.ok) throw new Error(`Yandex API ${res.status}: ${path}`)
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`Yandex API bad JSON: ${path}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchArtistMonthListeners(artistId: string): Promise<number> {
  if (listenersCache.has(artistId)) return listenersCache.get(artistId)!
  try {
    const data = await ymGet<YmBriefInfo>(`/artists/${artistId}/brief-info`, 12_000)
    const n = Number(data.result?.stats?.lastMonthListeners ?? 0)
    const safe = Number.isFinite(n) ? n : 0
    listenersCache.set(artistId, safe)
    return safe
  } catch {
    listenersCache.set(artistId, -1)
    return -1
  }
}

async function mapWithListeners(
  raw: YmTrack,
  genreTags: GenreTag[],
  tier: Exclude<PopularityTier, 'local'>,
): Promise<Track | null> {
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
): Promise<Track[]> {
  const out: Track[] = []
  const seen = new Set<string>()
  const concurrency = 3
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

export async function searchYandexTracks(
  text: string,
  page = 0,
): Promise<YmTrack[]> {
  try {
    const q = encodeURIComponent(text)
    const data = await ymGet<YmSearchResponse>(
      `/search?text=${q}&type=track&page=${page}&pageSize=20`,
      20_000,
    )
    return data.result?.tracks?.results ?? []
  } catch (e) {
    console.warn('search failed', text, e)
    return []
  }
}

export async function fetchYandexChartTracks(): Promise<YmTrack[]> {
  const data = await ymGet<YmChartResponse>('/landing3/chart', 25_000)
  return (data.result?.chart?.tracks ?? [])
    .map((row) => row.track)
    .filter((t): t is YmTrack => Boolean(t?.id))
}

export function yandexStreamUrl(trackId: string) {
  const base = ymProxyBase()
  if (isYcFunctionsDirect(base)) {
    return `${base}?trackId=${encodeURIComponent(trackId)}`
  }
  if (base) {
    return `${base}/ym-stream/${encodeURIComponent(trackId)}`
  }
  if (import.meta.env.DEV) {
    return `/ym-stream/${encodeURIComponent(trackId)}`
  }
  const apiBase =
    import.meta.env.VITE_API_URL ?? 'https://audioswipe.onrender.com/api'
  return `${apiBase.replace(/\/api$/, '')}/ym-stream/${encodeURIComponent(trackId)}`
}

/** Стрим через наш бэкенд (proxy=1) — иначе <audio> не играет 302 на storage.yandex.net */
export function yandexBlindStreamUrl(trackId: string) {
  const base = ymProxyBase()
  if (isYcFunctionsDirect(base)) {
    return `${base}?trackId=${encodeURIComponent(trackId)}&proxy=1`
  }
  const url = yandexStreamUrl(trackId)
  return `${url}${url.includes('?') ? '&' : '?'}proxy=1`
}

export function yandexEmbedUrl(trackId: string, albumId?: string) {
  if (albumId) return `https://music.yandex.ru/iframe/#track/${trackId}/${albumId}`
  return `https://music.yandex.ru/iframe/#track/${trackId}`
}

function formatListeners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function genreSearchQueries(g: GenreTag, tier: PopularityTier): string[] {
  const base = GENRE_QUERY[g]
  if (tier === 'deep_underground') {
    if (g === 'Рэп') return ['андерграунд рэп', 'русский рэп демо']
    if (g === 'Инди') return ['экспериментальный инди', 'инди андерграунд']
    if (g === 'Фонк') return ['drift phonk', 'phonk underground']
    return [`неизвестный ${base}`, base]
  }
  if (tier === 'freshmen') {
    if (g === 'Рэп') return ['новый рэп', 'русский рэп новинки']
    if (g === 'Инди') return ['инди новый', 'новый инди']
    return [`новый ${base}`, base]
  }
  return [base]
}

async function collectByGenres(
  tier: Exclude<PopularityTier, 'local'>,
  genres: GenreTag[],
  add: (track: YmTrack, g: GenreTag[]) => void,
) {
  const pagesPerQuery = tier === 'deep_underground' || tier === 'freshmen' ? 4 : 3
  for (const g of genres) {
    for (const query of genreSearchQueries(g, tier)) {
      for (let page = 0; page < pagesPerQuery; page++) {
        const found = await searchYandexTracks(query, page)
        for (const t of found) add(t, [g])
      }
    }
  }
}

export { formatListeners, TIER_RANGE, matchesTier, GENRE_QUERY }

/**
 * Чарт/поиск + фильтр слушателей.
 * Если выбраны жанры — только поиск по ним, без чарта (чарт = микс жанров).
 */
export async function fetchYandexRadarTracks(
  tier: PopularityTier,
  genres: GenreTag[],
  limit = 5,
  excludeIds: Set<string> = new Set(),
  blockedArtistIds: Set<string> = new Set(),
): Promise<Track[]> {
  if (tier === 'local') return []

  const excludeYm = new Set<string>()
  for (const id of excludeIds) {
    if (id.startsWith('ym-')) excludeYm.add(id.slice(3))
  }

  const selected = genres
  const candidates: Array<{ track: YmTrack; genres: GenreTag[] }> = []
  const seenTrack = new Set<string>(excludeYm)

  const add = (track: YmTrack, g: GenreTag[]) => {
    const id = String(track.id ?? '')
    const artistId = String(track.artists?.[0]?.id ?? '')
    if (!id || seenTrack.has(id)) return
    if (artistId && blockedArtistIds.has(artistId)) return
    seenTrack.add(id)
    candidates.push({ track, genres: g })
  }

  const chartTiers: PopularityTier[] = ['stadium', 'hitmakers', 'popular']
  const midTiers: PopularityTier[] = ['indie', 'popular']
  const digTiers: PopularityTier[] = ['deep_underground', 'freshmen']

  if (selected.length > 0) {
    await collectByGenres(tier as Exclude<PopularityTier, 'local'>, selected, add)
  } else if (chartTiers.includes(tier)) {
    try {
      const chart = await fetchYandexChartTracks()
      for (const t of chart) add(t, ['Поп'])
    } catch (e) {
      console.warn('chart failed', e)
    }
    const tags = ['Поп', 'Рэп'] as GenreTag[]
    for (const g of tags) {
      const found = await searchYandexTracks(GENRE_QUERY[g], 0)
      for (const t of found) add(t, [g])
    }
  } else if (midTiers.includes(tier)) {
    const tags = ['Поп', 'Рэп'] as GenreTag[]
    for (const g of tags) {
      const found = await searchYandexTracks(GENRE_QUERY[g], 0)
      for (const t of found) add(t, [g])
      const page2 = await searchYandexTracks(GENRE_QUERY[g], 1)
      for (const t of page2) add(t, [g])
    }
    if (tier === 'indie' && candidates.length < limit * 2) {
      try {
        const chart = await fetchYandexChartTracks()
        for (const t of chart) add(t, ['Поп'])
      } catch {
        /* ignore */
      }
    }
  } else if (digTiers.includes(tier)) {
    await collectByGenres(tier, ['Рэп', 'Инди'], add)
  }

  if (candidates.length === 0) {
    throw new Error('Нет кандидатов от Яндекса (чарт/поиск недоступны)')
  }

  const sliced = candidates.slice(0, Math.max(limit * 4, 24))
  return filterByTier(sliced, tier as Exclude<PopularityTier, 'local'>, limit, blockedArtistIds)
}
