import { query, type DbUser } from './db.js'

export interface StreamingLinks {
  spotify?: string
  apple?: string
  youtube?: string
  soundcloud?: string
  yandex?: string
}

export interface ProfileUpdateInput {
  artistName?: string
  avatarUrl?: string
  mainRole?: string
  dawSoftware?: string
  statusTag?: string
  social?: StreamingLinks
}

function cleanSocial(raw: StreamingLinks | undefined): StreamingLinks {
  if (!raw || typeof raw !== 'object') return {}
  const out: StreamingLinks = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) out[k as keyof StreamingLinks] = v.trim()
  }
  return out
}

export function parseSocialLinks(raw: unknown): StreamingLinks {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return cleanSocial(JSON.parse(raw) as StreamingLinks)
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return cleanSocial(raw as StreamingLinks)
  return {}
}

export async function updateUserProfile(
  userId: number,
  input: ProfileUpdateInput,
): Promise<{ ok: true; user: DbUser } | { ok: false; error: string }> {
  const artistName = input.artistName?.trim() || null
  const avatarUrl = input.avatarUrl?.trim() || null
  const mainRole = input.mainRole?.trim() || null
  const dawSoftware = input.dawSoftware?.trim() || null
  const statusTag = input.statusTag?.trim() || null
  const social = cleanSocial(input.social)

  try {
    const result = await query<DbUser>(
      `UPDATE users SET
        artist_name = COALESCE($2, artist_name),
        avatar_url = COALESCE($3, avatar_url),
        main_role = COALESCE($4, main_role),
        daw_software = COALESCE($5, daw_software),
        status_tag = COALESCE($6, status_tag),
        social_links = COALESCE($7::jsonb, social_links)
      WHERE id = $1
      RETURNING *`,
      [
        userId,
        artistName,
        avatarUrl,
        mainRole,
        dawSoftware,
        statusTag,
        JSON.stringify(social),
      ],
    )
    const user = result.rows[0]
    if (!user) return { ok: false, error: 'Пользователь не найден' }
    return { ok: true, user }
  } catch (e) {
    const msg =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message: string }).message)
        : ''
    if (/avatar_url|social_links|column/.test(msg)) {
      try {
        const result = await query<DbUser>(
          `UPDATE users SET
            artist_name = COALESCE($2, artist_name),
            main_role = COALESCE($3, main_role),
            daw_software = COALESCE($4, daw_software),
            status_tag = COALESCE($5, status_tag)
          WHERE id = $1
          RETURNING *`,
          [userId, artistName, mainRole, dawSoftware, statusTag],
        )
        const user = result.rows[0]
        if (!user) return { ok: false, error: 'Пользователь не найден' }
        return { ok: true, user }
      } catch (inner) {
        const hint =
          inner && typeof inner === 'object' && 'message' in inner
            ? String((inner as { message: string }).message)
            : 'Ошибка сохранения профиля'
        return { ok: false, error: hint.slice(0, 200) }
      }
    }
    return { ok: false, error: msg.slice(0, 200) || 'Ошибка сохранения профиля' }
  }
}
