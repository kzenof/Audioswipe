import dns from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import pg from 'pg'

dns.setDefaultResultOrder('ipv4first')

let pool: pg.Pool | null = null
let poolInit: Promise<pg.Pool> | null = null
let lastDbError: string | null = null

export interface DbUser {
  id: number
  email: string
  password_hash: string
  role: 'listener' | 'artist' | 'admin' | 'owner'
  artist_name: string | null
  main_role: string | null
  daw_software: string | null
  status_tag: string | null
  avatar_url?: string | null
  social_links?: unknown
  can_upload: boolean | null
  created_at: Date | string
}

function parseDatabaseUrl(raw: string) {
  const url = new URL(raw)
  return {
    hostname: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '').split('?')[0],
    isLocal: /localhost|127\.0\.0\.1/.test(url.hostname),
  }
}

async function createPool(): Promise<pg.Pool> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL не задан — укажи PostgreSQL в Environment на Render')
  }

  const cfg = parseDatabaseUrl(databaseUrl)
  let host = cfg.hostname

  if (!cfg.isLocal && cfg.hostname.startsWith('db.') && cfg.hostname.endsWith('.supabase.co')) {
    console.warn(
      'DB: Supabase Direct — только IPv6, Render не достучится. ' +
        'Используй pooler из Supabase → Connect → Session pooler.',
    )
  }

  if (!cfg.isLocal) {
    try {
      const { address } = await dnsLookup(cfg.hostname, { family: 4 })
      host = address
      console.log(`DB: ${cfg.hostname} → IPv4 ${host}:${cfg.port}`)
    } catch (e) {
      console.warn(`DB: IPv4 lookup failed for ${cfg.hostname}, using hostname`, e)
    }
  }

  const useSsl =
    process.env.DATABASE_SSL === 'true' ||
    (!cfg.isLocal && process.env.DATABASE_SSL !== 'false')

  const nextPool = new pg.Pool({
    host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    connectionTimeoutMillis: 15_000,
  })

  await nextPool.query('SELECT 1')
  return nextPool
}

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool
  if (!poolInit) {
    poolInit = createPool()
      .then((p) => {
        pool = p
        lastDbError = null
        return p
      })
      .catch((e) => {
        poolInit = null
        lastDbError = e instanceof Error ? e.message : String(e)
        throw e
      })
  }
  return poolInit
}

export function getLastDbError() {
  return lastDbError
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
  try {
    const p = await getPool()
    return p.query<T>(text, params)
  } catch (e) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: string }).code)
        : ''
    if (['ENETUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code)) {
      throw new DbUnavailableError()
    }
    throw e
  }
}

export async function checkDbConnection() {
  await getPool()
}

export class DbUnavailableError extends Error {
  constructor(message = 'База данных недоступна') {
    super(message)
    this.name = 'DbUnavailableError'
  }
}

export async function ensureDb() {
  try {
    await getPool()
  } catch {
    throw new DbUnavailableError()
  }
}
