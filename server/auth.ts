import crypto from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Response } from 'express'
import { normEmail, query, type DbUser } from './db.js'

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

export async function findUserByEmail(email: string) {
  const result = await query<DbUser>('SELECT * FROM users WHERE email = $1', [
    normEmail(email),
  ])
  return result.rows[0]
}

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
    createdAt: u.created_at,
  }
}

export interface RegisterInput {
  email: string
  password: string
  role: 'listener' | 'artist'
  artistName?: string
  mainRole?: string
  dawSoftware?: string
  statusTag?: string
}

export async function registerUser(input: RegisterInput) {
  const email = normEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: 'Некорректный логин (email)' }
  }
  if (input.password.length < 4) {
    return { ok: false as const, error: 'Пароль — минимум 4 символа' }
  }
  if (await findUserByEmail(email)) {
    return { ok: false as const, error: 'Такой логин уже занят' }
  }

  const hash = await hashPassword(input.password)
  const result = await query<DbUser>(
    `INSERT INTO users (email, password_hash, role, artist_name, main_role, daw_software, status_tag)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      email,
      hash,
      input.role,
      input.role === 'artist' ? input.artistName ?? email.split('@')[0] : null,
      input.role === 'artist' ? input.mainRole ?? null : null,
      input.role === 'artist' ? input.dawSoftware ?? null : null,
      input.role === 'artist' ? input.statusTag ?? null : null,
    ],
  )

  const user = result.rows[0]
  return { ok: true as const, user, token: signToken(user) }
}

/** Заготовка под 2FA — таблица auth_codes уже в schema.sql */
export async function loginUser(email: string, password: string) {
  const user = await findUserByEmail(email)
  if (!user || !(await checkPassword(password, user.password_hash))) {
    return { ok: false as const, error: 'Неверный логин или пароль' }
  }
  return { ok: true as const, user, token: signToken(user) }
}
