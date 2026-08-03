import { query } from './db.js'

export async function listBlacklist(userId: number): Promise<string[]> {
  const result = await query<{ yandex_artist_id: string }>(
    'SELECT yandex_artist_id FROM user_blacklists WHERE user_id = $1',
    [userId],
  )
  return result.rows.map((r) => r.yandex_artist_id)
}

export async function addToBlacklist(userId: number, yandexArtistId: string) {
  const id = yandexArtistId.trim()
  if (!id) return listBlacklist(userId)
  await query(
    `INSERT INTO user_blacklists (user_id, yandex_artist_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, yandex_artist_id) DO NOTHING`,
    [userId, id],
  )
  return listBlacklist(userId)
}
