import { createHash, createHmac } from 'node:crypto'
import type { Express, Request, Response } from 'express'

const YM_CLIENT = 'YandexMusicDesktop/24023621'
const STREAM_SIGN_SECRET = 'p93jhgh689SBReK6ghtw62'

interface DownloadInfoItem {
  codec?: string
  preview?: boolean
  downloadInfoUrl?: string
  bitrateInKbps?: number
}

interface StorageMeta {
  s: string
  ts: string
  path: string
  host: string
}

function ymHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Yandex-Music-Client': YM_CLIENT,
    Accept: 'application/json',
  }
  const token = process.env.YANDEX_MUSIC_TOKEN?.trim()
  if (token) {
    headers.Authorization = token.startsWith('OAuth ') ? token : `OAuth ${token}`
  }
  return headers
}

function buildMp3Url(info: StorageMeta) {
  const trackUrl = `XGRlBW9FXlekgbPrRHuSiA${info.path.substring(1)}${info.s}`
  const hash = createHash('md5').update(trackUrl).digest('hex')
  return `https://${info.host}/get-mp3/${hash}/${info.ts}${info.path}`
}

function signedDownloadParams(trackId: string) {
  const ts = Math.floor(Date.now() / 1000)
  const sign = createHmac('sha256', STREAM_SIGN_SECRET)
    .update(`${trackId}${ts}`)
    .digest('base64')
  return new URLSearchParams({
    can_use_streaming: 'true',
    ts: String(ts),
    sign,
  })
}

async function resolveDirectUrl(trackId: string): Promise<string> {
  const qs = signedDownloadParams(trackId)
  const infoRes = await fetch(
    `https://api.music.yandex.net/tracks/${trackId}/download-info?${qs}`,
    { headers: ymHeaders() },
  )
  if (!infoRes.ok) {
    throw new Error(`download-info ${infoRes.status}`)
  }
  const infoJson = (await infoRes.json()) as {
    result?: DownloadInfoItem[] | { name?: string; message?: string }
  }
  if (infoJson.result && !Array.isArray(infoJson.result)) {
    const err = infoJson.result
    throw new Error(err.message || err.name || 'download-info rejected')
  }
  const items = (infoJson.result as DownloadInfoItem[] | undefined) ?? []
  const chosen =
    items.find((i) => i.preview && i.codec === 'mp3') ||
    items.find((i) => i.codec === 'mp3') ||
    items[0]
  if (!chosen?.downloadInfoUrl) {
    throw new Error('no downloadInfoUrl')
  }

  const metaRes = await fetch(`${chosen.downloadInfoUrl}&format=json`)
  if (!metaRes.ok) {
    throw new Error(`download meta ${metaRes.status}`)
  }
  const meta = (await metaRes.json()) as StorageMeta
  if (!meta.host || !meta.path || !meta.ts || !meta.s) {
    throw new Error('bad storage meta')
  }
  return buildMp3Url(meta)
}

const urlCache = new Map<string, { url: string; at: number }>()
const CACHE_MS = 4 * 60 * 1000

async function cachedDirectUrl(trackId: string) {
  const hit = urlCache.get(trackId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.url
  const url = await resolveDirectUrl(trackId)
  urlCache.set(trackId, { url, at: Date.now() })
  return url
}

/** Прокси JSON API Яндекс Музыки (обход CORS на проде). */
export function registerYmApiProxy(app: Express) {
  app.use('/ym-api', async (req, res) => {
    const path = req.path || '/'
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    try {
      const upstream = await fetch(`https://api.music.yandex.net${path}${qs}`, {
        method: req.method === 'HEAD' ? 'GET' : req.method,
        headers: ymHeaders(),
      })
      const body = Buffer.from(await upstream.arrayBuffer())
      res.status(upstream.status)
      const ct = upstream.headers.get('content-type')
      if (ct) res.setHeader('Content-Type', ct)
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.send(body)
    } catch (e) {
      res.status(502).json({
        error: 'yandex_api_failed',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  })
}

/**
 * GET /ym-stream/:trackId → 302 на прямой mp3 (или прокси при ?proxy=1).
 * Нужен YANDEX_MUSIC_TOKEN, иначе Яндекс отвечает no-rights.
 */
export async function handleYmStream(req: Request, res: Response) {
  const trackId = decodeURIComponent(String(req.params.trackId ?? ''))
  if (!trackId) {
    res.status(400).json({ error: 'trackId required' })
    return
  }
  try {
    const direct = await cachedDirectUrl(trackId)
    if (req.query.proxy === '1') {
      const range = req.headers.range
      const upstream = await fetch(direct, {
        headers: range ? { Range: String(range) } : undefined,
      })
      res.status(upstream.status)
      for (const h of [
        'content-type',
        'content-length',
        'accept-ranges',
        'content-range',
        'cache-control',
      ]) {
        const v = upstream.headers.get(h)
        if (v) res.setHeader(h, v)
      }
      res.setHeader('Access-Control-Allow-Origin', '*')
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.send(buf)
      return
    }
    res.redirect(302, direct)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const needsToken = /no-rights|not-allowed|Unauthorized/i.test(message)
    res.status(502).json({
      error: 'yandex_stream_failed',
      message,
      hint: needsToken
        ? 'Яндекс вернул no-rights: задай YANDEX_MUSIC_TOKEN (OAuth) в env Vercel'
        : undefined,
    })
  }
}
