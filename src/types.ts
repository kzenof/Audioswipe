export type Role = 'listener' | 'artist' | null
export type AccountRole = 'listener' | 'artist' | 'admin'

export type ReportReason =
  | 'Кража трека / авторское право'
  | 'Ненависть / разжигание вражды'
  | 'Другое нарушение правил'

export type ReportStatus = 'pending' | 'dismissed' | 'actioned'

export interface PlatformReport {
  id: number
  reporterLogin: string
  reportedLogin: string | null
  reportedArtistName: string | null
  trackId: string | null
  trackTitle: string | null
  reason: string
  status: ReportStatus
  createdAt: string
}

export interface AdminUserRow {
  id: number
  login: string
  role: AccountRole
  artistName: string | null
  canUpload: boolean
  createdAt: string
}

export const REPORT_REASONS: ReportReason[] = [
  'Кража трека / авторское право',
  'Ненависть / разжигание вражды',
  'Другое нарушение правил',
]

export type ArtistRole = 'Битмейкер' | 'Вокалист' | 'Сонграйтер' | 'Звукарь'

export type Soft = 'FL Studio' | 'Ableton' | 'Logic' | 'Pro Tools' | 'Cubase'

export type FitStatus =
  | 'Ищу бит для альбома'
  | 'За респект'
  | 'Коммерческий заказ'
  | 'Открыт к фитам'
  | 'Не ищу коллабы'

export type GenreTag = 'Рэп' | 'Фонк' | 'Поп' | 'Рок' | 'Электроника' | 'Инди'

/**
 * Глубина радара по слушателям/мес (Яндекс) + SoundLink.
 * Порядок — от «копания» к стадиону, затем локальные демо.
 */
export type PopularityTier =
  | 'deep_underground'
  | 'freshmen'
  | 'indie'
  | 'popular'
  | 'hitmakers'
  | 'stadium'
  | 'local'

export type TrackSource = 'yandex' | 'soundlink'

export interface RadarFilters {
  popularity: PopularityTier
  genres: GenreTag[]
}

export interface StreamingLinks {
  spotify?: string
  apple?: string
  youtube?: string
  soundcloud?: string
  yandex?: string
}

export interface Track {
  id: string
  title: string
  artistId: string
  artistName: string
  avatar: string
  genre: string
  /** Теги для радара */
  genreTags: GenreTag[]
  duration: number
  focusFeedback?: string
  skipCurve: number[]
  openToCollab: boolean
  artistRole?: ArtistRole
  soft?: Soft[]
  status?: FitStatus
  streaming: StreamingLinks
  waveSeed: number
  audioUrl?: string
  hasAudio?: boolean
  /** Откуда трек: каталог Яндекс / демо с сайта */
  source: TrackSource
  /** Слушатели за месяц (мок Яндекс Музыки). У SoundLink = 0 */
  monthlyListeners: number
  /** ID трека/альбома в Яндекс Музыке для iframe */
  yandexTrackId?: string
  yandexAlbumId?: string
}

export interface Feedback {
  trackId: string
  emojis: string[]
  comment: string
  liked: boolean
  listenedToEnd: boolean
  timestamp: number
  fromUser?: string
  progress?: number
}

export interface Discovery extends Track {
  feedback: Feedback
  addedAt: number
}

export interface CollabProfile {
  name: string
  avatar: string
  role: ArtistRole
  soft: Soft[]
  genres: string[]
  status: FitStatus
  references: { id: string; title: string; genre: string }[]
  bio: string
}

export interface FitCard {
  id: string
  name: string
  avatar: string
  role: ArtistRole
  soft: Soft[]
  genres: string[]
  status: FitStatus
  styleHint: string
  openToCollab: boolean
}

export interface FitProposal {
  id: string
  from: FitCard
  toName: string
  message: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: number
}

export interface ChatMessage {
  id: string
  from: 'me' | 'them'
  text: string
  time: string
}

export type ListenerPhase = 'radar' | 'roulette' | 'feedback' | 'reveal'
export type ListenerTab = 'scout' | 'finds'
export type ArtistTab = 'music' | 'fit'
export type FitView = 'profile' | 'feed'

export const GENRE_TAGS: GenreTag[] = [
  'Рэп',
  'Фонк',
  'Поп',
  'Рок',
  'Электроника',
  'Инди',
]

export const POPULARITY_LABELS: Record<
  PopularityTier,
  { title: string; short: string; range: string; hint: string }
> = {
  deep_underground: {
    title: 'Глубокий андеграунд',
    short: 'Андеграунд',
    range: 'до 5 000 / мес',
    hint: 'Ноунеймы, локальные группы, экспериментальный звук и первые демки. Настоящее цифровое копание.',
  },
  freshmen: {
    title: 'Фрешмены',
    short: 'Фрешмены',
    range: '5 000–50 000 / мес',
    hint: 'Уже есть стиль и небольшая фан-база, замечают локальные медиа. Сок для поиска будущих звёзд.',
  },
  indie: {
    title: 'Инди-сцена',
    short: 'Инди',
    range: '50 000–300 000 / мес',
    hint: 'Крепкие независимые артисты: клубы в крупных городах, музыка для ценителей жанра.',
  },
  popular: {
    title: 'Популярные',
    short: 'Популярные',
    range: '300 000–1 000 000 / мес',
    hint: 'Топ-релизы пятницы и плейлисты вроде «Искра». Имена на слуху у тех, кто следит за индустрией.',
  },
  hitmakers: {
    title: 'Хитмейкеры',
    short: 'Хитмейкеры',
    range: '1 000 000–5 000 000 / мес',
    hint: 'Лица чартов уровня Toxi$, Дора, Aarne, Big Baby Tape. Угадай суперхит по первым секундам.',
  },
  stadium: {
    title: 'Стадионные звёзды',
    short: 'Стадионы',
    range: '5 000 000+ / мес',
    hint: 'Главные имена с миллионами слушателей — режим максимальной узнаваемости вслепую.',
  },
  local: {
    title: 'Локальные',
    short: 'Локальные',
    range: 'на сайте',
    hint: 'Демки артистов, загруженные прямо на Audioswipe.',
  },
}

/** Миграция старых тиров из localStorage */
export function normalizePopularityTier(raw: unknown): PopularityTier {
  const known: PopularityTier[] = [
    'deep_underground',
    'freshmen',
    'indie',
    'popular',
    'hitmakers',
    'stadium',
    'local',
  ]
  if (typeof raw === 'string' && (known as string[]).includes(raw)) {
    return raw as PopularityTier
  }
  if (raw === 'stars') return 'hitmakers'
  if (raw === 'known') return 'indie'
  if (raw === 'underground') return 'freshmen'
  return 'freshmen'
}

export function tierFromListeners(
  monthlyListeners: number,
  source: TrackSource,
): PopularityTier {
  if (source === 'soundlink') return 'local'
  if (monthlyListeners >= 5_000_000) return 'stadium'
  if (monthlyListeners >= 1_000_000) return 'hitmakers'
  if (monthlyListeners >= 300_000) return 'popular'
  if (monthlyListeners >= 50_000) return 'indie'
  if (monthlyListeners >= 5_000) return 'freshmen'
  return 'deep_underground'
}
