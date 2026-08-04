import dns from 'node:dns'
import pg from 'pg'

// Render не ходит в IPv6 — Supabase/Neon часто отдают AAAA-запись первой
dns.setDefaultResultOrder('ipv4first')

const databaseUrl = process.env.DATABASE_URL
const isLocal =
  !databaseUrl || /localhost|127\.0\.0\.1/.test(databaseUrl)

const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  (!isLocal && process.env.DATABASE_SSL !== 'false')

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
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

export function normLogin(login: string) {
  return login.trim().toLowerCase()
}

/** @deprecated use normLogin */
export const normEmail = normLogin

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params)
}

export async function checkDbConnection() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан — укажи PostgreSQL в Environment на Render')
  }
  await query('SELECT 1')
}
