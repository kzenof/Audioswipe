import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Response } from 'express'
import { normLogin, query, type DbUser } from './db.js'

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

  const hash = await hashPassword(input.password)
  const result = await query<DbUser>(
    `INSERT INTO users (email, password_hash, role, artist_name, main_role, daw_software, status_tag, can_upload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true)
     RETURNING *`,
    [
      login,
      hash,
      input.role,
      input.role === 'artist' ? input.artistName ?? login : null,
      input.role === 'artist' ? input.mainRole ?? null : null,
      input.role === 'artist' ? input.dawSoftware ?? null : null,
      input.role === 'artist' ? input.statusTag ?? null : null,
    ],
  )

  const user = result.rows[0]
  return { ok: true as const, user, token: signToken(user) }
}

export async function loginUser(login: string, password: string) {
  const user = await findUserByLogin(login)
  if (!user || !(await checkPassword(password, user.password_hash))) {
    return { ok: false as const, error: 'Неверный логин или пароль' }
  }
  return { ok: true as const, user, token: signToken(user) }
}
