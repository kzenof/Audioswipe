import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  apiCheckUpload,
  apiLogin,
  apiRegister,
  apiMe,
  apiSubmitReport,
  apiUpdateProfile,
  type ApiUser,
} from '../lib/api'
import {
  emptyCabinet,
  ensureLocalCabinet,
  findAccount,
  getSession,
  ownTracksOnly,
  saveCabinet,
  setSession,
  type UserCabinet,
} from '../lib/auth'
import {
  blockArtist as persistBlockArtist,
  clearBlacklistCache,
  filterBlockedTracks,
  getBlacklist,
  loadBlacklistFromApi,
} from '../lib/blacklist'
import {
  defaultRadar,
  loadFeedTracks,
  patchArtistFeedTracks,
  pickLocalTracks,
  publishToFeed,
} from '../lib/feed'
import { fetchYandexRadarTracks } from '../lib/yandex'
import {
  FETCH_BATCH,
  INITIAL_BATCH,
  mergeIntoBuffer,
  needsPrefetch,
} from '../lib/trackPipeline'
import {
  buildSkipCurve,
  getReviewsForTrack,
  publishReview,
  recordListen,
  type TrackReview,
} from '../lib/reviews'
import {
  normalizePopularityTier,
  isStaffRole,
  type AccountRole,
  type ArtistTab,
  type ChatMessage,
  type CollabProfile,
  type Discovery,
  type Feedback,
  type FitProposal,
  type FitView,
  type GenreTag,
  type ListenerPhase,
  type RadarFilters,
  type Role,
  type StreamingLinks,
  type Track,
} from '../types'
import type { UploadTrackInput } from '../components/TrackUploadPanel'

type AuthFail = { ok: false; error: string }
type AuthOk = { ok: true }

interface AppState {
  user: string | null
  role: Role
  accountRole: AccountRole | null
  authToken: string | null
  canUpload: boolean
  login: (login: string, password: string, role: Exclude<Role, null>) => Promise<AuthOk | AuthFail>
  adminLogin: (login: string, password: string) => Promise<AuthOk | AuthFail>
  register: (login: string, password: string, role: Exclude<Role, null>) => Promise<AuthOk | AuthFail>
  logout: () => void
  switchToListener: () => void
  switchToArtist: () => void
  goHome: () => void
  submitReport: (track: Track, reason: string) => Promise<void>
  cabinetReady: boolean
  refreshProfile: () => Promise<void>

  radar: RadarFilters
  setRadarPopularity: (p: RadarFilters['popularity']) => void
  toggleRadarGenre: (g: GenreTag) => void
  startScout: () => void
  openRadar: () => void
  radarLoading: boolean
  bufferLoading: boolean

  trackQueue: Track[]
  currentTrack: Track | null
  listenerPhase: ListenerPhase
  playLiked: boolean
  discoveries: Discovery[]
  likeTrack: (progress?: number) => void
  skipTrack: (progress?: number) => void
  blockArtist: () => void
  submitFeedback: (emojis: string[], comment: string, progress?: number) => void
  addToFinds: () => void
  nextTrack: () => void
  listenedToEnd: boolean
  markListenedToEnd: () => void
  getTrackReviews: (trackId: string) => TrackReview[]
  refreshArtistStats: () => void
  listenProgress: number
  setListenProgress: (p: number) => void

  artistTab: ArtistTab
  setArtistTab: (tab: ArtistTab) => void
  fitView: FitView
  setFitView: (view: FitView) => void
  collabProfile: CollabProfile
  setCollabProfile: (p: CollabProfile) => void
  saveArtistProfile: () => Promise<void>
  myTracks: Track[]
  addMyTrack: (file: File, input: UploadTrackInput) => void | Promise<void>
  focusFeedback: string
  setFocusFeedback: (v: string) => void

  proposals: FitProposal[]
  notifications: string[]
  proposeFit: (to: { id: string; name: string }, message?: string) => void
  acceptProposal: (id: string) => void
  declineProposal: (id: string) => void
  dismissNotification: (index: number) => void

  chatOpen: boolean
  chatPartner: string | null
  chatMessages: ChatMessage[]
  openChat: (partner: string) => void
  closeChat: () => void
  sendChat: (text: string) => void
}

const AppContext = createContext<AppState | null>(null)

const FALLBACK_PROFILE: CollabProfile = {
  name: '',
  avatar: '',
  role: 'Битмейкер',
  soft: [],
  genres: [],
  status: 'Открыт к фитам',
  references: [],
  bio: '',
  social: {},
}

function mergeApiUserProfile(prev: CollabProfile, apiUser: ApiUser, login: string): CollabProfile {
  const softFromApi = apiUser.dawSoftware
    ? (apiUser.dawSoftware.split(',').map((s) => s.trim()).filter(Boolean) as CollabProfile['soft'])
    : prev.soft
  const roleFromApi = (apiUser.mainRole as CollabProfile['role']) || prev.role
  const statusFromApi = (apiUser.statusTag as CollabProfile['status']) || prev.status
  return {
    ...prev,
    name: apiUser.artistName?.trim() || prev.name || login,
    avatar: apiUser.avatarUrl?.trim() || prev.avatar,
    role: roleFromApi,
    soft: softFromApi.length ? softFromApi : prev.soft,
    status: statusFromApi,
    social: {
      ...prev.social,
      ...(apiUser.socialLinks ?? {}),
    },
  }
}

function cleanSocialForApi(social: StreamingLinks): StreamingLinks {
  const out: StreamingLinks = {}
  for (const [k, v] of Object.entries(social)) {
    if (typeof v === 'string' && v.trim()) out[k as keyof StreamingLinks] = v.trim()
  }
  return out
}

function normLogin(login: string) {
  return login.trim().toLowerCase()
}

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [user, setUser] = useState<string | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [accountRole, setAccountRole] = useState<AccountRole | null>(null)
  const [canUpload, setCanUpload] = useState(true)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [cabinetReady, setCabinetReady] = useState(false)

  const [radar, setRadar] = useState<RadarFilters>(defaultRadar)
  const [radarLoading, setRadarLoading] = useState(false)
  const [bufferLoading, setBufferLoading] = useState(false)
  const [trackQueue, setTrackQueue] = useState<Track[]>([])
  const [feedTracks, setFeedTracks] = useState<Track[]>([])
  const [listenerPhase, setListenerPhase] = useState<ListenerPhase>('radar')
  const [playLiked, setPlayLiked] = useState(false)
  const [listenedToEnd, setListenedToEnd] = useState(false)
  const [discoveries, setDiscoveries] = useState<Discovery[]>([])
  const [pendingFeedback, setPendingFeedback] = useState<Feedback | null>(null)

  const [artistTab, setArtistTab] = useState<ArtistTab>('music')
  const [fitView, setFitView] = useState<FitView>('profile')
  const [collabProfile, setCollabProfile] = useState<CollabProfile>(FALLBACK_PROFILE)
  const [myTracks, setMyTracks] = useState<Track[]>([])
  const [focusFeedback, setFocusFeedback] = useState('Оцените сведение')
  const [proposals, setProposals] = useState<FitProposal[]>([])
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessage[]>>({})

  const [notifications, setNotifications] = useState<string[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPartner, setChatPartner] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [listenProgress, setListenProgress] = useState(0)
  const [statsTick, setStatsTick] = useState(0)

  const persistSkip = useRef(true)
  const userRef = useRef<string | null>(null)
  const seenTrackIdsRef = useRef<Set<string>>(new Set())
  const prefetchLockRef = useRef(false)
  const authTokenRef = useRef<string | null>(null)
  const userIdRef = useRef<number | null>(null)
  const feedTracksRef = useRef<Track[]>([])
  const radarRef = useRef(radar)
  userRef.current = user
  feedTracksRef.current = feedTracks
  radarRef.current = radar

  const applyCabinet = useCallback((loginName: string, cabinet: UserCabinet, apiUser?: ApiUser) => {
    setDiscoveries(cabinet.discoveries ?? [])
    setMyTracks(ownTracksOnly(loginName, cabinet.myTracks))
    const baseProfile = {
      ...(cabinet.collabProfile ?? emptyCabinet(loginName).collabProfile),
      social: cabinet.collabProfile?.social ?? {},
    }
    setCollabProfile(
      apiUser ? mergeApiUserProfile(baseProfile, apiUser, loginName) : baseProfile,
    )
    setFocusFeedback(cabinet.focusFeedback || 'Оцените сведение')
    setProposals(cabinet.proposals ?? [])
    setChatThreads(cabinet.chatThreads ?? {})
    const r = cabinet.radar ?? defaultRadar()
    setRadar({
      ...r,
      popularity: normalizePopularityTier(r.popularity),
    })
    setListenerPhase('radar')
    setTrackQueue([])
    setPlayLiked(false)
    setListenedToEnd(false)
    setPendingFeedback(null)
    setChatOpen(false)
    setChatPartner(null)
    setChatMessages([])
  }, [])

  const refreshFeed = useCallback(async () => {
    const feed = await loadFeedTracks()
    setFeedTracks(feed)
    return feed
  }, [])

  useEffect(() => {
    void refreshFeed()
  }, [refreshFeed])

  useEffect(() => {
    const s = getSession()
    if (!s?.token) {
      setCabinetReady(true)
      return
    }
    void (async () => {
      try {
        const { user: apiUser } = await apiMe(s.token!)
        const acc = findAccount(apiUser.email)
        const cabinet = acc?.cabinet ?? ensureLocalCabinet(apiUser.email)
        persistSkip.current = true
        authTokenRef.current = s.token!
        setAuthToken(s.token!)
        userIdRef.current = s.userId ?? apiUser.id
        setUser(apiUser.email)
        setAccountRole(apiUser.role)
        setCanUpload(apiUser.canUpload)
        setRole(s.role ?? (isStaffRole(apiUser.role) ? null : apiUser.role === 'artist' ? 'artist' : 'listener'))
        applyCabinet(apiUser.email, cabinet, apiUser)
        await loadBlacklistFromApi(s.token!)
        void refreshFeed()
      } catch {
        setSession(null)
        clearBlacklistCache()
      } finally {
        setCabinetReady(true)
      }
    })()
  }, [applyCabinet, refreshFeed])

  const refreshProfile = useCallback(async () => {
    const token = authTokenRef.current
    if (!token) return
    try {
      const { user: apiUser } = await apiMe(token)
      setUser(apiUser.email)
      setAccountRole(apiUser.role)
      setCanUpload(apiUser.canUpload)
      userIdRef.current = apiUser.id
      setCollabProfile((prev) => mergeApiUserProfile(prev, apiUser, apiUser.email))
    } catch {
      /* session expired — admin page will 404 */
    }
  }, [])

  const saveArtistProfile = useCallback(async () => {
    const token = authTokenRef.current
    const login = userRef.current
    if (!login) throw new Error('Войдите в аккаунт')

    const social = cleanSocialForApi(collabProfile.social)
    if (token) {
      const { user: apiUser } = await apiUpdateProfile(token, {
        artistName: collabProfile.name.trim() || login,
        avatarUrl: collabProfile.avatar.trim() || undefined,
        mainRole: collabProfile.role,
        dawSoftware: collabProfile.soft.join(', ') || undefined,
        statusTag: collabProfile.status,
        social,
      })
      setCollabProfile((prev) => mergeApiUserProfile(prev, apiUser, login))
      setCanUpload(apiUser.canUpload)
    }

    setFeedTracks((feed) =>
      feed.map((t) =>
        normLogin(t.artistId) === normLogin(login)
          ? {
              ...t,
              artistName: collabProfile.name.trim() || login,
              avatar: collabProfile.avatar,
              streaming: { ...social },
              artistRole: collabProfile.role,
              soft: [...collabProfile.soft],
              status: collabProfile.status,
            }
          : t,
      ),
    )
    patchArtistFeedTracks(login, {
      artistName: collabProfile.name.trim() || login,
      avatar: collabProfile.avatar,
      streaming: { ...social },
      artistRole: collabProfile.role,
      soft: [...collabProfile.soft],
      status: collabProfile.status,
    })
    setMyTracks((tracks) =>
      tracks.map((t) => ({
        ...t,
        artistName: collabProfile.name.trim() || login,
        avatar: collabProfile.avatar,
        streaming: { ...social },
        artistRole: collabProfile.role,
        soft: [...collabProfile.soft],
        status: collabProfile.status,
      })),
    )
    setNotifications((n) => ['Профиль артиста сохранён', ...n])
  }, [collabProfile])

  useEffect(() => {
    if (!user || !cabinetReady) return
    if (persistSkip.current) {
      persistSkip.current = false
      return
    }
    // не сохраняем чужой кабинет при гонке смены аккаунта
    if (userRef.current !== user) return
    saveCabinet(user, {
      discoveries,
      myTracks: ownTracksOnly(user, myTracks),
      collabProfile,
      focusFeedback,
      proposals,
      chatThreads,
      radar,
    })
  }, [
    user,
    cabinetReady,
    discoveries,
    myTracks,
    collabProfile,
    focusFeedback,
    proposals,
    chatThreads,
    radar,
  ])

  useEffect(() => {
    if (!user) return
    setSession({
      login: user,
      role,
      token: authTokenRef.current ?? undefined,
      userId: userIdRef.current ?? undefined,
    })
  }, [user, role])

  const enterAccount = useCallback(
    (
      apiUser: ApiUser,
      nextRole: Exclude<Role, null>,
      token: string,
    ) => {
      persistSkip.current = true
      authTokenRef.current = token
      setAuthToken(token)
      userIdRef.current = apiUser.id
      const email = apiUser.email
      const acc = findAccount(email)
      const cabinet = acc?.cabinet ?? ensureLocalCabinet(email)
      setUser(email)
      setAccountRole(apiUser.role)
      setCanUpload(apiUser.canUpload)
      setRole(nextRole)
      applyCabinet(email, cabinet, apiUser)
      setSession({ login: email, role: nextRole, token, userId: apiUser.id })
      setNotifications([])
      void loadBlacklistFromApi(token).catch(() => clearBlacklistCache())
      void refreshFeed()
      if (nextRole === 'listener') {
        setListenerPhase('radar')
      }
      if (nextRole === 'artist') {
        setArtistTab('music')
        const empty =
          !cabinet.collabProfile?.bio &&
          (cabinet.collabProfile?.soft?.length ?? 0) === 0 &&
          (cabinet.collabProfile?.references?.length ?? 0) === 0
        setFitView(empty ? 'profile' : 'feed')
      }
      if (isStaffRole(apiUser.role)) {
        navigate('/admin-zone')
      }
    },
    [applyCabinet, refreshFeed, navigate],
  )

  const login = useCallback(
    async (
      loginName: string,
      password: string,
      nextRole: Exclude<Role, null>,
    ): Promise<AuthOk | AuthFail> => {
      try {
        const { token, user } = await apiLogin(loginName, password)
        ensureLocalCabinet(user.email)
        enterAccount(user, nextRole, token)
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Ошибка входа',
        }
      }
    },
    [enterAccount],
  )

  const adminLogin = useCallback(
    async (loginName: string, password: string): Promise<AuthOk | AuthFail> => {
      try {
        const { token, user } = await apiLogin(loginName, password)
        if (!isStaffRole(user.role)) {
          return { ok: false, error: 'Нет доступа' }
        }
        ensureLocalCabinet(user.email)
        enterAccount(user, 'listener', token)
        setRole(null)
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Ошибка входа',
        }
      }
    },
    [enterAccount],
  )

  const register = useCallback(
    async (
      loginName: string,
      password: string,
      nextRole: Exclude<Role, null>,
    ): Promise<AuthOk | AuthFail> => {
      try {
        const { token, user, isFirstUser } = await apiRegister({
          login: loginName,
          password,
          role: nextRole,
          artistName: loginName,
        })
        ensureLocalCabinet(user.email)
        enterAccount(user, nextRole, token)
        if (isFirstUser || isStaffRole(user.role)) {
          setNotifications((n) => [
            'Ты первый пользователь — роль admin/owner. Открой /admin-zone',
            ...n,
          ])
        }
        return { ok: true }
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Ошибка регистрации',
        }
      }
    },
    [enterAccount],
  )

  const logout = useCallback(() => {
    setSession(null)
    authTokenRef.current = null
    setAuthToken(null)
    userIdRef.current = null
    clearBlacklistCache()
    setUser(null)
    setRole(null)
    setAccountRole(null)
    setCanUpload(true)
    setDiscoveries([])
    setMyTracks([])
    setCollabProfile(FALLBACK_PROFILE)
    setProposals([])
    setChatThreads({})
    setNotifications([])
    setTrackQueue([])
    setFeedTracks([])
    setListenerPhase('radar')
    setChatOpen(false)
    setChatPartner(null)
    setChatMessages([])
    void refreshFeed()
  }, [refreshFeed])

  const goHome = useCallback(() => {
    setRole(null)
    setListenerPhase('radar')
    setTrackQueue([])
    navigate('/')
  }, [navigate])

  const setRadarPopularity = useCallback((p: RadarFilters['popularity']) => {
    setRadar((r) => ({ ...r, popularity: p }))
  }, [])

  const toggleRadarGenre = useCallback((g: GenreTag) => {
    setRadar((r) => ({
      ...r,
      genres: r.genres.includes(g)
        ? r.genres.filter((x) => x !== g)
        : [...r.genres, g],
    }))
  }, [])

  const fetchBatch = useCallback(
    async (count: number, feed: Track[]) => {
      const filters = radarRef.current
      const login = userRef.current
      const blocked = new Set(getBlacklist(login))
      let batch: Track[]

      if (filters.popularity === 'local') {
        batch = pickLocalTracks(
          feed,
          filters.genres,
          login,
          count,
          seenTrackIdsRef.current,
          blocked,
        )
      } else {
        batch = await fetchYandexRadarTracks(
          filters.popularity,
          filters.genres,
          count,
          seenTrackIdsRef.current,
          blocked,
        )
      }

      return filterBlockedTracks(batch, login)
    },
    [],
  )

  const ensureBuffer = useCallback(
    async (knownLength?: number) => {
      if (prefetchLockRef.current) return
      const len = knownLength ?? trackQueue.length
      if (!needsPrefetch(len)) return

      prefetchLockRef.current = true
      setBufferLoading(true)
      try {
        const feed =
          feedTracksRef.current.length > 0
            ? feedTracksRef.current
            : await refreshFeed()
        const batch = await fetchBatch(FETCH_BATCH, feed)
        if (batch.length) {
          setTrackQueue((q) => {
            const login = userRef.current
            const cleaned = filterBlockedTracks(q, login)
            return mergeIntoBuffer(cleaned, batch, seenTrackIdsRef.current)
          })
        }
      } catch (e) {
        console.warn('buffer prefetch failed', e)
      } finally {
        prefetchLockRef.current = false
        setBufferLoading(false)
      }
    },
    [fetchBatch, refreshFeed, trackQueue.length],
  )

  useEffect(() => {
    if (listenerPhase !== 'roulette') return
    if (needsPrefetch(trackQueue.length)) {
      void ensureBuffer(trackQueue.length)
    }
  }, [trackQueue.length, listenerPhase, ensureBuffer])

  const startScout = useCallback(async () => {
    if (radarLoading) return
    setRadarLoading(true)
    seenTrackIdsRef.current = new Set()
    try {
      const feed = await refreshFeed()
      const batch = await fetchBatch(INITIAL_BATCH, feed)
      batch.forEach((t) => seenTrackIdsRef.current.add(t.id))

      const queue = filterBlockedTracks(batch, user)
      setTrackQueue(queue)
      setListenerPhase(queue.length ? 'roulette' : 'radar')
      setPlayLiked(false)
      setListenedToEnd(false)
      setPendingFeedback(null)
      setListenProgress(0)

      if (!queue.length) {
        setNotifications((n) => [
          radar.popularity === 'local'
            ? 'Пока нет чужих демо — загрузи с другого аккаунта или смени фильтр'
            : 'По фильтру слушателей треков не нашлось — смени тир/жанр',
          ...n,
        ])
      } else if (queue.length < 3) {
        void ensureBuffer(queue.length)
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : String(e)
      setNotifications((n) => [
        `Радар: ${
          msg.includes('403') || msg.includes('заблокировал')
            ? 'Яндекс временно заблокировал прокси — подожди 30–60 мин'
            : msg.includes('451') || msg.includes('за рубежом')
              ? 'Яндекс блокирует зарубежные сервера — нужен прокси в РФ'
              : msg.includes('кандидат') ||
                  msg.includes('abort') ||
                  msg.includes('ETIMEDOUT') ||
                  msg.includes('502')
                ? 'Сервис не ответил вовремя — попробуй ещё раз или смени фильтр'
                : msg
        }`,
        ...n,
      ])
    } finally {
      setRadarLoading(false)
    }
  }, [refreshFeed, radar, radarLoading, fetchBatch, ensureBuffer])

  const openRadar = useCallback(() => {
    setListenerPhase('radar')
    setTrackQueue([])
    seenTrackIdsRef.current = new Set()
    setPlayLiked(false)
    setListenedToEnd(false)
    setPendingFeedback(null)
  }, [])

  const currentTrack = trackQueue[0] ?? null

  const advanceQueue = useCallback(() => {
    setTrackQueue((q) => {
      const next = q.slice(1)
      if (next.length === 0) {
        void ensureBuffer(0)
      }
      return next
    })
    setListenerPhase('roulette')
    setPlayLiked(false)
    setListenedToEnd(false)
    setPendingFeedback(null)
    setListenProgress(0)
  }, [ensureBuffer])

  const likeTrack = useCallback(
    (progress = listenProgress) => {
      if (currentTrack) {
        recordListen({
          trackId: currentTrack.id,
          artistId: currentTrack.artistId,
          progress: Math.max(progress, 0.05),
          skipped: false,
        })
      }
      setPlayLiked(true)
      setListenerPhase('feedback')
    },
    [currentTrack, listenProgress],
  )

  const skipTrack = useCallback(
    (progress = listenProgress) => {
      if (currentTrack) {
        recordListen({
          trackId: currentTrack.id,
          artistId: currentTrack.artistId,
          progress,
          skipped: true,
        })
      }
      advanceQueue()
    },
    [advanceQueue, currentTrack, listenProgress],
  )

  const blockArtistAction = useCallback(() => {
    if (!user) {
      setNotifications((n) => ['Войдите, чтобы блокировать артистов', ...n])
      return
    }
    if (!currentTrack) return

    persistBlockArtist(currentTrack.artistId, user).catch(() => {
      setNotifications((n) => ['Не удалось сохранить блокировку', ...n])
    })
    recordListen({
      trackId: currentTrack.id,
      artistId: currentTrack.artistId,
      progress: listenProgress,
      skipped: true,
    })

    setTrackQueue((q) => {
      const next = filterBlockedTracks(
        q.filter((t) => t.artistId !== currentTrack.artistId),
        user,
      )
      if (next.length === 0) {
        void ensureBuffer(0)
      } else if (needsPrefetch(next.length)) {
        void ensureBuffer(next.length)
      }
      return next
    })
    setListenerPhase('roulette')
    setPlayLiked(false)
    setListenedToEnd(false)
    setPendingFeedback(null)
    setListenProgress(0)
    setNotifications((n) => ['Артист скрыт из радара', ...n])
  }, [user, currentTrack, listenProgress, ensureBuffer])

  const markListenedToEnd = useCallback(() => {
    if (currentTrack) {
      recordListen({
        trackId: currentTrack.id,
        artistId: currentTrack.artistId,
        progress: 1,
        skipped: false,
      })
    }
    setListenProgress(1)
    setListenedToEnd(true)
    setPlayLiked(true)
    setListenerPhase('feedback')
  }, [currentTrack])

  const submitFeedback = useCallback(
    (emojis: string[], comment: string, progress = listenProgress) => {
      if (!currentTrack || !user) return
      const fb: Feedback = {
        trackId: currentTrack.id,
        emojis,
        comment,
        liked: playLiked,
        listenedToEnd,
        timestamp: Date.now(),
        fromUser: user,
        progress,
      }
      setPendingFeedback(fb)

      // Доставляем отзыв в кабинет артиста (SoundLink и любой artistId)
      publishReview({
        trackId: currentTrack.id,
        artistId: currentTrack.artistId,
        fromUser: user,
        emojis,
        comment: comment.trim(),
        liked: playLiked,
        listenedToEnd,
        progress,
      })
      setStatsTick((n) => n + 1)
      setListenerPhase('reveal')
    },
    [currentTrack, playLiked, listenedToEnd, listenProgress, user],
  )

  const addToFinds = useCallback(() => {
    if (!currentTrack || !pendingFeedback) {
      advanceQueue()
      return
    }
    setDiscoveries((d) => {
      if (d.some((x) => x.id === currentTrack.id)) return d
      return [
        {
          ...currentTrack,
          feedback: pendingFeedback,
          addedAt: Date.now(),
        },
        ...d,
      ]
    })
    advanceQueue()
  }, [currentTrack, pendingFeedback, advanceQueue])

  const nextTrack = useCallback(() => advanceQueue(), [advanceQueue])

  const getTrackReviews = useCallback(
    (trackId: string) => {
      void statsTick
      return getReviewsForTrack(trackId)
    },
    [statsTick],
  )

  const refreshArtistStats = useCallback(() => {
    if (!user) return
    const feed = feedTracksRef.current
    setMyTracks((tracks) =>
      ownTracksOnly(
        user,
        tracks.map((t) => {
          const fromFeed = feed.find((f) => f.id === t.id)
          return {
            ...t,
            ...(fromFeed
              ? {
                  audioUrl: fromFeed.audioUrl,
                  hasAudio: fromFeed.hasAudio,
                  duration: fromFeed.duration,
                  previewStartSec: fromFeed.previewStartSec,
                  previewDurationSec: fromFeed.previewDurationSec,
                }
              : {}),
            skipCurve: buildSkipCurve(t.id),
          }
        }),
      ),
    )
    setStatsTick((n) => n + 1)
  }, [user])

  const switchToListener = useCallback(() => {
    if (!user) return
    setRole('listener')
    setListenerPhase('radar')
    setTrackQueue([])
    void refreshFeed()
  }, [user, refreshFeed])

  const switchToArtist = useCallback(() => {
    if (!user) return
    setRole('artist')
    setArtistTab('music')
    void refreshFeed().then((feed) => {
      const acc = findAccount(user)
      if (!acc) return
      persistSkip.current = true
      const mine = ownTracksOnly(user, acc.cabinet.myTracks).map((t) => {
        const fromFeed = feed.find((f) => f.id === t.id)
        return {
          ...t,
          ...(fromFeed
            ? {
                audioUrl: fromFeed.audioUrl,
                hasAudio: fromFeed.hasAudio,
                duration: fromFeed.duration,
                previewStartSec: fromFeed.previewStartSec,
                previewDurationSec: fromFeed.previewDurationSec,
              }
            : {}),
          skipCurve: buildSkipCurve(t.id),
        }
      })
      setMyTracks(mine)
      setStatsTick((n) => n + 1)
    })
  }, [user, refreshFeed])

  const addMyTrack = useCallback(
    async (file: File, input: UploadTrackInput) => {
      if (!user) throw new Error('Войдите в аккаунт')
      const token = authTokenRef.current
      if (token) {
        const check = await apiCheckUpload(token)
        if (!check.allowed) {
          setNotifications((n) => [
            check.error ?? 'Вы заблокированы за нарушение правил',
            ...n,
          ])
          setCanUpload(false)
          throw new Error(check.error ?? 'Загрузка запрещена')
        }
      } else if (!canUpload) {
        const msg = 'Вы заблокированы за нарушение правил'
        setNotifications((n) => [msg, ...n])
        throw new Error(msg)
      }

      const name = input.title.trim() || file.name.replace(/\.[^.]+$/, '')
      const social = cleanSocialForApi(collabProfile.social)
      const base: Track = {
        id: `mine-${user}-${Date.now()}`,
        title: name,
        artistId: user,
        artistName: collabProfile.name.trim() || user,
        avatar: collabProfile.avatar,
        genre: input.genreTag,
        genreTags: [input.genreTag],
        duration: 40,
        previewStartSec: input.previewStartSec,
        previewDurationSec: input.previewDurationSec,
        focusFeedback,
        skipCurve: [],
        openToCollab: true,
        artistRole: collabProfile.role,
        soft: [...collabProfile.soft],
        status: collabProfile.status,
        streaming: { ...social },
        waveSeed: Math.floor(Math.random() * 30) + 1,
        hasAudio: true,
        source: 'soundlink',
        monthlyListeners: 0,
      }

      const published = await publishToFeed(base, file)
      setMyTracks((t) => ownTracksOnly(user, [published, ...t]))
      setFeedTracks((f) => [published, ...f.filter((x) => x.id !== published.id)])
      setNotifications((n) => [
        `«${name}» загружено. Слушатели услышат фрагмент с ${input.previewStartSec} сек.`,
        ...n,
      ])
    },
    [user, collabProfile, focusFeedback, canUpload],
  )

  const submitReport = useCallback(
    async (track: Track, reason: string) => {
      const token = authTokenRef.current
      if (!token || !user) {
        throw new Error('Войдите, чтобы отправить жалобу')
      }
      await apiSubmitReport(token, {
        reason,
        trackId: track.id,
        trackTitle: track.title,
        reportedLogin:
          track.source === 'soundlink' ? track.artistId : undefined,
      })
      setNotifications((n) => ['Жалоба отправлена модераторам', ...n])
    },
    [user],
  )

  const proposeFit = useCallback(
    (to: { id: string; name: string }, message?: string) => {
      const displayName = collabProfile.name || user || 'Артист'
      const proposal: FitProposal = {
        id: `p-${Date.now()}`,
        from: {
          id: user || 'me',
          name: displayName,
          avatar: collabProfile.avatar,
          role: collabProfile.role,
          soft: collabProfile.soft,
          genres: collabProfile.genres,
          status: collabProfile.status,
          styleHint: collabProfile.bio || 'Без описания',
          openToCollab: true,
        },
        toName: to.name,
        message:
          message ||
          `Твой трек оценил ${collabProfile.role}${
            collabProfile.soft.length ? `, пишет в ${collabProfile.soft.join(', ')}` : ''
          } и хочет сделать совместный трек!`,
        status: 'pending',
        createdAt: Date.now(),
      }
      setProposals((p) => [proposal, ...p])
      setNotifications((n) => [`Предложение фита отправлено → ${to.name}`, ...n])
    },
    [collabProfile, user],
  )

  const acceptProposal = useCallback((id: string) => {
    setProposals((ps) => {
      const target = ps.find((x) => x.id === id)
      if (target) {
        const msgs: ChatMessage[] = [
          {
            id: 'm0',
            from: 'them',
            text: 'Йо! Услышал про фит — давай кидай демо, обсудим.',
            time: 'сейчас',
          },
        ]
        setChatPartner(target.toName)
        setChatOpen(true)
        setChatMessages(msgs)
        setChatThreads((threads) => ({ ...threads, [target.toName]: msgs }))
        setNotifications((n) => [
          `${target.toName} принял фит! Открыт приватный чат.`,
          ...n,
        ])
      }
      return ps.map((p) =>
        p.id === id ? { ...p, status: 'accepted' as const } : p,
      )
    })
  }, [])

  const declineProposal = useCallback((id: string) => {
    setProposals((ps) =>
      ps.map((p) => (p.id === id ? { ...p, status: 'declined' as const } : p)),
    )
  }, [])

  const dismissNotification = useCallback((index: number) => {
    setNotifications((n) => n.filter((_, i) => i !== index))
  }, [])

  const openChat = useCallback(
    (partner: string) => {
      setChatPartner(partner)
      setChatOpen(true)
      setChatMessages(
        chatThreads[partner] ?? [
          {
            id: 'm0',
            from: 'them',
            text: 'Привет! Готов к коллабе — кидай референсы.',
            time: 'сейчас',
          },
        ],
      )
    },
    [chatThreads],
  )

  const closeChat = useCallback(() => setChatOpen(false), [])

  const sendChat = useCallback(
    (text: string) => {
      if (!text.trim() || !chatPartner) return
      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        from: 'me',
        text: text.trim(),
        time: 'сейчас',
      }
      setChatMessages((m) => {
        const next = [...m, msg]
        setChatThreads((threads) => ({ ...threads, [chatPartner]: next }))
        return next
      })
    },
    [chatPartner],
  )

  const value = useMemo(
    () => ({
      user,
      role,
      accountRole,
      authToken,
      canUpload,
      login,
      adminLogin,
      register,
      logout,
      switchToListener,
      switchToArtist,
      goHome,
      submitReport,
      cabinetReady,
      refreshProfile,
      radar,
      setRadarPopularity,
      toggleRadarGenre,
      startScout,
      openRadar,
      radarLoading,
      bufferLoading,
      trackQueue,
      currentTrack,
      listenerPhase,
      playLiked,
      discoveries,
      likeTrack,
      skipTrack,
      blockArtist: blockArtistAction,
      submitFeedback,
      addToFinds,
      nextTrack,
      listenedToEnd,
      markListenedToEnd,
      getTrackReviews,
      refreshArtistStats,
      listenProgress,
      setListenProgress,
      artistTab,
      setArtistTab,
      fitView,
      setFitView,
      collabProfile,
      setCollabProfile,
      saveArtistProfile,
      myTracks,
      addMyTrack,
      focusFeedback,
      setFocusFeedback,
      proposals,
      notifications,
      proposeFit,
      acceptProposal,
      declineProposal,
      dismissNotification,
      chatOpen,
      chatPartner,
      chatMessages,
      openChat,
      closeChat,
      sendChat,
    }),
    [
      user,
      role,
      accountRole,
      authToken,
      canUpload,
      login,
      adminLogin,
      register,
      logout,
      switchToListener,
      switchToArtist,
      goHome,
      submitReport,
      cabinetReady,
      refreshProfile,
      radar,
      setRadarPopularity,
      toggleRadarGenre,
      startScout,
      openRadar,
      radarLoading,
      bufferLoading,
      trackQueue,
      currentTrack,
      listenerPhase,
      playLiked,
      discoveries,
      likeTrack,
      skipTrack,
      blockArtistAction,
      submitFeedback,
      addToFinds,
      nextTrack,
      listenedToEnd,
      markListenedToEnd,
      getTrackReviews,
      refreshArtistStats,
      listenProgress,
      artistTab,
      fitView,
      collabProfile,
      saveArtistProfile,
      myTracks,
      addMyTrack,
      focusFeedback,
      proposals,
      notifications,
      proposeFit,
      acceptProposal,
      declineProposal,
      dismissNotification,
      chatOpen,
      chatPartner,
      chatMessages,
      openChat,
      closeChat,
      sendChat,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
