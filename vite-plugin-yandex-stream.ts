import type { Plugin } from 'vite'
import { createHash } from 'node:crypto'

const YM_HEADERS = {
  'X-Yandex-Music-Client': 'YandexMusicDesktop/24023621',
  Accept: 'application/json',
}

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

function buildMp3Url(info: StorageMeta) {
  const trackUrl = `XGRlBW9FXlekgbPrRHuSiA${info.path.substring(1)}${info.s}`
  const hash = createHash('md5').update(trackUrl).digest('hex')
  return `https://${info.host}/get-mp3/${hash}/${info.ts}${info.path}`
}

async function resolveDirectUrl(trackId: string): Promise<string> {
  const infoRes = await fetch(
    `https://api.music.yandex.net/tracks/${trackId}/download-info`,
    { headers: YM_HEADERS },
  )
  if (!infoRes.ok) {
    throw new Error(`download-info ${infoRes.status}`)
  }
  const infoJson = (await infoRes.json()) as { result?: DownloadInfoItem[] }
  const items = infoJson.result ?? []
  // превью, если есть; иначе лучший mp3
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

/**
 * Путь 1: скрытый аудиопоток.
 * GET /ym-stream/:trackId → проксирует mp3 с Яндекса (через download-info).
 */
export function yandexStreamPlugin(): Plugin {
  return {
    name: 'yandex-stream',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url?.split('?')[0] ?? ''
        const match = raw.match(/^\/ym-stream\/([^/]+)\/?$/)
        if (!match) return next()

        const trackId = decodeURIComponent(match[1])
        try {
          const direct = await cachedDirectUrl(trackId)
          const range = req.headers.range
          const upstream = await fetch(direct, {
            headers: range ? { Range: String(range) } : undefined,
          })

          res.statusCode = upstream.status
          const pass = [
            'content-type',
            'content-length',
            'accept-ranges',
            'content-range',
            'cache-control',
          ]
          for (const h of pass) {
            const v = upstream.headers.get(h)
            if (v) res.setHeader(h, v)
          }
          res.setHeader('Access-Control-Allow-Origin', '*')

          if (!upstream.body) {
            res.end()
            return
          }

          const reader = upstream.body.getReader()
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read()
            if (done) {
              res.end()
              return
            }
            res.write(Buffer.from(value))
            await pump()
          }
          await pump()
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'yandex_stream_failed',
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })
    },
  }
}
