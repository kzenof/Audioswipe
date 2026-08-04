import type { Response } from 'express'
import { authFromHeader, findUserById } from './auth.js'
import { query } from './db.js'

export function requireAdmin(authHeader: string | undefined, res: Response) {
  const auth = authFromHeader(authHeader)
  if (!auth) {
    res.status(401).json({ error: 'Требуется авторизация' })
    return null
  }
  if (auth.role !== 'admin') {
    res.status(404).json({ error: 'Not found' })
    return null
  }
  return auth
}

export interface AdminUserRow {
  id: number
  email: string
  role: string
  artist_name: string | null
  can_upload: boolean
  created_at: Date | string
}

export function mapAdminUser(u: AdminUserRow) {
  return {
    id: u.id,
    login: u.email,
    role: u.role,
    artistName: u.artist_name,
    canUpload: u.can_upload !== false,
    createdAt: u.created_at,
  }
}

export async function listUsers(search = '') {
  const q = search.trim()
  if (q) {
    const result = await query<AdminUserRow>(
      `SELECT id, email, role, artist_name, can_upload, created_at
       FROM users
       WHERE artist_name ILIKE $1 OR email ILIKE $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [`%${q}%`],
    )
    return result.rows
  }
  const result = await query<AdminUserRow>(
    `SELECT id, email, role, artist_name, can_upload, created_at
     FROM users
     ORDER BY created_at DESC
     LIMIT 100`,
  )
  return result.rows
}

export async function setCanUpload(userId: number, canUpload: boolean) {
  const target = await findUserById(userId)
  if (!target) return { ok: false as const, error: 'Пользователь не найден' }
  if (target.role === 'admin') {
    return { ok: false as const, error: 'Нельзя блокировать администратора' }
  }
  await query('UPDATE users SET can_upload = $1 WHERE id = $2', [canUpload, userId])
  const updated = await findUserById(userId)
  if (!updated) return { ok: false as const, error: 'Пользователь не найден' }
  return { ok: true as const, user: updated }
}
