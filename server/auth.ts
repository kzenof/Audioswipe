import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Response } from 'express'
import { normLogin, query, type DbUser } from './db.js'
import { parseSocialLinks } from './profile.js'

const JWT_SECRET = process.env.JWT_SECRET ?? 'audioswipe-dev-secret-change-me'

export function signToken(user: Pick<DbUser, 'id' | 'email' | 'role'>) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token: string): { userId: number; email: string; role: string } | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url')
  if (sig !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      sub: number
      email: string
      role: string
      exp: number
    }
    if (payload.exp * 1000 < Date.now()) return null
    return { userId: payload.sub, email: payload.email, role: payload.role }
  } catch {
    return null
  }
}

export function authFromHeader(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null
  return verifyToken(authHeader.slice(7))
}

export function requireAuth(authHeader: string | undefined, res: Response) {
  const auth = authFromHeader(authHeader)
  if (!auth) {
    res.status(401).json({ error: 'Требуется авторизация' })
    return null
  }
  return auth
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function checkPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export async function findUserByLogin(login: string) {
  const result = await query<DbUser>('SELECT * FROM users WHERE email = $1', [
    normLogin(login),
  ])
  return result.rows[0]
}

/** @deprecated use findUserByLogin */
export const findUserByEmail = findUserByLogin

export async function findUserById(id: number) {
  const result = await query<DbUser>('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0]
}

export function publicUser(u: DbUser) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    artistName: u.artist_name,
    mainRole: u.main_role,
    dawSoftware: u.daw_software,
    statusTag: u.status_tag,
    avatarUrl: u.avatar_url ?? null,
    socialLinks: parseSocialLinks(u.social_links),
    canUpload: u.can_upload !== false,
    createdAt: u.created_at,
  }
}

export interface RegisterInput {
  login: string
  password: string
  role: 'listener' | 'artist'
  artistName?: string
  mainRole?: string
  dawSoftware?: string
  statusTag?: string
}

function validateLogin(login: string) {
  const trimmed = login.trim()
  if (trimmed.length < 3) return 'Логин — минимум 3 символа'
  if (trimmed.length > 32) return 'Логин — максимум 32 символа'
  if (!/^[a-zA-Z0-9_а-яА-ЯёЁ-]+$/.test(trimmed)) {
    return 'Логин: только буквы, цифры, _ и -'
  }
  return null
}

function pgErrorHint(e: unknown): string | null {
  if (!e || typeof e !== 'object' || !('code' in e)) return null
  const err = e as { code: string; column?: string; constraint?: string }
  if (err.code === '42703') {
    return `В БД нет колонки «${err.column ?? '?'}». Проверь схему users в Supabase.`
  }
  if (err.code === '23514' && String(err.constraint ?? '').includes('role')) {
    return 'Роль admin/owner не разрешена в БД. Обнови CHECK constraint для role'
  }
  if (err.code === '23505') return 'Такой логин уже занят'
  return null
}

async function countUsers() {
  const result = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users')
  return Number(result.rows[0]?.count ?? 0)
}

export async function registerUser(input: RegisterInput) {
  const loginErr = validateLogin(input.login)
  if (loginErr) {
    return { ok: false as const, error: loginErr }
  }
  const login = normLogin(input.login)
  if (input.password.length < 4) {
    return { ok: false as const, error: 'Пароль — минимум 4 символа' }
  }
  if (await findUserByLogin(login)) {
    return { ok: false as const, error: 'Такой логин уже занят' }
  }

  const isFirstUser = (await countUsers()) === 0
  const role = isFirstUser ? 'admin' : input.role
  const hash = await hashPassword(input.password)
  const artistName =
    role === 'artist' || isFirstUser ? input.artistName ?? login : null
  const params = [
    login,
    hash,
    role,
    artistName,
    role === 'artist' ? input.mainRole ?? null : null,
    role === 'artist' ? input.dawSoftware ?? null : null,
    role === 'artist' ? input.statusTag ?? null : null,
  ]

  try {
    const result = await query<DbUser>(
      `INSERT INTO users (email, password_hash, role, artist_name, main_role, daw_software, status_tag, can_upload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *`,
      params,
    )
    const user = result.rows[0]
    return { ok: true as const, user, token: signToken(user), isFirstUser }
  } catch (e) {
    const hint = pgErrorHint(e)
    if (hint?.includes('can_upload') || (e && typeof e === 'object' && 'column' in e && (e as { column?: string }).column === 'can_upload')) {
      try {
        const result = await query<DbUser>(
          `INSERT INTO users (email, password_hash, role, artist_name, main_role, daw_software, status_tag)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          params,
        )
        const user = result.rows[0]
        return { ok: true as const, user, token: signToken(user), isFirstUser }
      } catch (e2) {
        const hint2 = pgErrorHint(e2)
        if (hint2) return { ok: false as const, error: hint2 }
        throw e2
      }
    }
    if (hint) return { ok: false as const, error: hint }
    throw e
  }
}

export async function loginUser(login: string, password: string) {
  const user = await findUserByLogin(login)
  if (!user || !(await checkPassword(password, user.password_hash))) {
    return { ok: false as const, error: 'Неверный логин или пароль' }
  }
  return { ok: true as const, user, token: signToken(user) }
}
