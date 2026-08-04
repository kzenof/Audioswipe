import type {
  ChatMessage,
  CollabProfile,
  Discovery,
  FitProposal,
  RadarFilters,
  Role,
  Track,
} from '../types'

export interface UserCabinet {
  discoveries: Discovery[]
  myTracks: Track[]
  collabProfile: CollabProfile
  focusFeedback: string
  proposals: FitProposal[]
  chatThreads: Record<string, ChatMessage[]>
  radar?: RadarFilters
}

export interface Account {
  login: string
  password: string
  createdAt: number
  cabinet: UserCabinet
}

export interface Session {
  login: string
  role: Role
  userId?: number
  token?: string
}

const ACCOUNTS_KEY = 'signal_accounts_v2'
const SESSION_KEY = 'signal_session_v2'

function normLogin(login: string) {
  return login.trim().toLowerCase()
}

export function emptyCollabProfile(login: string): CollabProfile {
  return {
    name: login,
    avatar: `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(login)}&backgroundColor=0a0a12`,
    role: 'Битмейкер',
    soft: [],
    genres: [],
    status: 'Открыт к фитам',
    references: [],
    bio: '',
    social: {},
  }
}

export function emptyCabinet(login: string): UserCabinet {
  return {
    discoveries: [],
    myTracks: [],
    collabProfile: emptyCollabProfile(login),
    focusFeedback: 'Оцените сведение',
    proposals: [],
    chatThreads: {},
    radar: { popularity: 'local', genres: [] },
  }
}

/** Только свои треки — чужие из ленты в кабинет не попадают */
export function ownTracksOnly(login: string, tracks: Track[] | undefined): Track[] {
  const key = normLogin(login)
  return (tracks ?? [])
    .filter((t) => normLogin(t.artistId) === key)
    .map((t) => {
      const { audioUrl: _a, ...rest } = t
      return rest
    })
}

function readAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Account[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s?.login) return null
    return s
  } catch {
    return null
  }
}

export function setSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function findAccount(login: string): Account | undefined {
  const key = normLogin(login)
  return readAccounts().find((a) => normLogin(a.login) === key)
}

/** Локальный кабинет (находки, треки) — пока в localStorage, auth в SQL */
export function ensureLocalCabinet(email: string): UserCabinet {
  const trimmed = email.trim()
  const existing = findAccount(trimmed)
  if (existing) return existing.cabinet
  const account: Account = {
    login: trimmed,
    password: '',
    createdAt: Date.now(),
    cabinet: emptyCabinet(trimmed),
  }
  const accounts = readAccounts()
  accounts.push(account)
  writeAccounts(accounts)
  return account.cabinet
}

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: string }

function sanitizeAccount(account: Account): Account {
  const login = account.login
  const cabinet = account.cabinet ?? emptyCabinet(login)
  return {
    ...account,
    cabinet: {
      ...emptyCabinet(login),
      ...cabinet,
      myTracks: ownTracksOnly(login, cabinet.myTracks),
      discoveries: cabinet.discoveries ?? [],
      proposals: cabinet.proposals ?? [],
      chatThreads: cabinet.chatThreads ?? {},
      collabProfile: {
        ...(cabinet.collabProfile ?? emptyCollabProfile(login)),
        social: cabinet.collabProfile?.social ?? {},
      },
    },
  }
}

export function registerAccount(login: string, password: string): AuthResult {
  const trimmed = login.trim()
  if (trimmed.length < 3) {
    return { ok: false, error: 'Логин — минимум 3 символа' }
  }
  if (password.length < 4) {
    return { ok: false, error: 'Пароль — минимум 4 символа' }
  }
  if (findAccount(trimmed)) {
    return { ok: false, error: 'Такой логин уже занят' }
  }

  const account: Account = {
    login: trimmed,
    password,
    createdAt: Date.now(),
    cabinet: emptyCabinet(trimmed),
  }
  const accounts = readAccounts()
  accounts.push(account)
  writeAccounts(accounts)
  return { ok: true, account }
}

export function loginAccount(login: string, password: string): AuthResult {
  const account = findAccount(login)
  if (!account) {
    return { ok: false, error: 'Аккаунт не найден' }
  }
  if (account.password !== password) {
    return { ok: false, error: 'Неверный пароль' }
  }
  const clean = sanitizeAccount(account)
  // persist sanitize so чужие треки вычищаются
  saveCabinet(clean.login, clean.cabinet)
  return { ok: true, account: clean }
}

export function saveCabinet(login: string, cabinet: UserCabinet) {
  const accounts = readAccounts()
  const key = normLogin(login)
  const idx = accounts.findIndex((a) => normLogin(a.login) === key)
  if (idx < 0) return
  accounts[idx] = {
    ...accounts[idx],
    cabinet: {
      ...cabinet,
      myTracks: ownTracksOnly(login, cabinet.myTracks),
    },
  }
  writeAccounts(accounts)
}
