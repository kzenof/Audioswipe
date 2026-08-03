import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
})

export interface DbUser {
  id: number
  email: string
  password_hash: string
  role: 'listener' | 'artist'
  artist_name: string | null
  main_role: string | null
  daw_software: string | null
  status_tag: string | null
  created_at: Date | string
}

export function normEmail(email: string) {
  return email.trim().toLowerCase()
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params)
}

export async function checkDbConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL не задан — укажи PostgreSQL в .env')
  }
  await query('SELECT 1')
}
