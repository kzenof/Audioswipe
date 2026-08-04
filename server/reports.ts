import { findUserById } from './auth.js'
import { query } from './db.js'

export interface DbReport {
  id: number
  reporter_id: number
  reported_user_id: number | null
  track_id: string | null
  track_title: string | null
  reason: string
  status: string
  created_at: Date | string
}

export const REPORT_REASONS = [
  'Кража трека / авторское право',
  'Ненависть / разжигание вражды',
  'Другое нарушение правил',
] as const

export async function createReport(input: {
  reporterId: number
  reportedUserId?: number | null
  trackId?: string
  trackTitle?: string
  reason: string
}) {
  const reason = input.reason.trim()
  if (!reason) return { ok: false as const, error: 'Укажите причину жалобы' }

  const result = await query<DbReport>(
    `INSERT INTO reports (reporter_id, reported_user_id, track_id, track_title, reason, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [
      input.reporterId,
      input.reportedUserId ?? null,
      input.trackId ?? null,
      input.trackTitle ?? null,
      reason,
    ],
  )
  return { ok: true as const, report: result.rows[0] }
}

export async function listPendingReports() {
  const result = await query<
    DbReport & {
      reporter_login: string
      reported_login: string | null
      reported_artist_name: string | null
    }
  >(
    `SELECT r.*,
            rep.email AS reporter_login,
            tar.email AS reported_login,
            tar.artist_name AS reported_artist_name
     FROM reports r
     JOIN users rep ON rep.id = r.reporter_id
     LEFT JOIN users tar ON tar.id = r.reported_user_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at DESC`,
  )
  return result.rows
}

export function mapReport(row: Awaited<ReturnType<typeof listPendingReports>>[number]) {
  return {
    id: row.id,
    reporterLogin: row.reporter_login,
    reportedLogin: row.reported_login,
    reportedArtistName: row.reported_artist_name,
    trackId: row.track_id,
    trackTitle: row.track_title,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function dismissReport(reportId: number) {
  const result = await query<DbReport>(
    `UPDATE reports SET status = 'dismissed' WHERE id = $1 AND status = 'pending' RETURNING *`,
    [reportId],
  )
  if (!result.rows[0]) return { ok: false as const, error: 'Жалоба не найдена' }
  return { ok: true as const }
}

export async function banArtistFromReport(reportId: number) {
  const reportResult = await query<DbReport>(
    'SELECT * FROM reports WHERE id = $1 AND status = $2',
    [reportId, 'pending'],
  )
  const report = reportResult.rows[0]
  if (!report) return { ok: false as const, error: 'Жалоба не найдена' }
  if (!report.reported_user_id) {
    return { ok: false as const, error: 'Артист не привязан к аккаунту — бан вручную по нику' }
  }

  const target = await findUserById(report.reported_user_id)
  if (!target) return { ok: false as const, error: 'Артист не найден' }
  if (target.role === 'admin') {
    return { ok: false as const, error: 'Нельзя заблокировать администратора' }
  }

  await query('UPDATE users SET can_upload = false WHERE id = $1', [report.reported_user_id])
  await query(`UPDATE reports SET status = 'actioned' WHERE id = $1`, [reportId])
  return { ok: true as const }
}
