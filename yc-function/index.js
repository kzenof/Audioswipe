/**
 * Yandex Cloud Functions — прокси Яндекс Музыки для Audioswipe.
 *
 * Точка входа: index.handler
 * Runtime: Node.js 18 / 20 / 22 (все ок)
 *
 * Env:
 *   YANDEX_MUSIC_TOKEN — OAuth токен (обязателен для стрима)
 *
 * Пути (через API Gateway или если path пробрасывается):
 *   GET /ym-api/...     → прокси api.music.yandex.net
 *   GET /ym-stream/:id  → 302 на mp3
 *   GET /health         → { ok: true }
 */

const crypto = require('crypto')

const YM_CLIENT = 'YandexMusicDesktop/24023621'
const STREAM_SIGN_SECRET = 'p93jhgh689SBReK6ghtw62'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Yandex-Music-Client,Accept',
}

function ymHeaders() {
  const headers = {
    'X-Yandex-Music-Client': YM_CLIENT,
    Accept: 'application/json',
  }
  const token = (process.env.YANDEX_MUSIC_TOKEN || '').trim()
  if (token) {
    headers.Authorization = token.startsWith('OAuth ') ? token : `OAuth ${token}`
  }
  return headers
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

function redirect(url) {
  return {
    statusCode: 302,
    headers: { ...CORS, Location: url },
    body: '',
  }
}

function getPath(event) {
  // API Gateway / HTTPS invoke
  let path =
    event.path ||
    event.url ||
    (event.requestContext && event.requestContext.http && event.requestContext.http.path) ||
    '/'
  // иногда path = полный URL
  if (path.startsWith('http')) {
    try {
      path = new URL(path).pathname
    } catch (_) {
      /* keep */
    }
  }
  // срезаем префикс function id если есть
  path = path.replace(/^\/[a-z0-9]{20,}\//i, '/')
  return path.split('?')[0] || '/'
}

function getQuery(event) {
  return event.queryStringParameters || {}
}

function buildMp3Url(info) {
  const trackUrl = `XGRlBW9FXlekgbPrRHuSiA${info.path.substring(1)}${info.s}`
  const hash = crypto.createHash('md5').update(trackUrl).digest('hex')
  return `https://${info.host}/get-mp3/${hash}/${info.ts}${info.path}`
}

function signedQs(trackId) {
  const ts = Math.floor(Date.now() / 1000)
  const sign = crypto
    .createHmac('sha256', STREAM_SIGN_SECRET)
    .update(`${trackId}${ts}`)
    .digest('base64')
  return new URLSearchParams({
    can_use_streaming: 'true',
    ts: String(ts),
    sign,
  })
}

async function resolveDirectUrl(trackId) {
  const qs = signedQs(trackId)
  const infoRes = await fetch(
    `https://api.music.yandex.net/tracks/${trackId}/download-info?${qs}`,
    { headers: ymHeaders() },
  )
  if (!infoRes.ok) throw new Error(`download-info ${infoRes.status}`)
  const infoJson = await infoRes.json()
  if (infoJson.result && !Array.isArray(infoJson.result)) {
    const err = infoJson.result
    throw new Error(err.message || err.name || 'download-info rejected')
  }
  const items = infoJson.result || []
  const chosen =
    items.find((i) => i.preview && i.codec === 'mp3') ||
    items.find((i) => i.codec === 'mp3') ||
    items[0]
  if (!chosen || !chosen.downloadInfoUrl) throw new Error('no downloadInfoUrl')

  const metaRes = await fetch(`${chosen.downloadInfoUrl}&format=json`)
  if (!metaRes.ok) throw new Error(`download meta ${metaRes.status}`)
  const meta = await metaRes.json()
  if (!meta.host || !meta.path || !meta.ts || !meta.s) throw new Error('bad storage meta')
  return buildMp3Url(meta)
}

async function proxyYmApi(ymPath, query) {
  const qs = new URLSearchParams(query || {}).toString()
  const url = `https://api.music.yandex.net${ymPath}${qs ? `?${qs}` : ''}`
  const upstream = await fetch(url, { headers: ymHeaders() })
  const text = await upstream.text()
  if (upstream.status === 451) {
    return json(451, {
      error: 'yandex_geo_blocked',
      message: 'Unexpected 451 from Yandex inside RU cloud — check function region',
    })
  }
  return {
    statusCode: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'public, max-age=60',
    },
    body: text,
  }
}

module.exports.handler = async function handler(event) {
  const method = (event.httpMethod || 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }

  const path = getPath(event)
  const query = getQuery(event)

  // Сначала query-режим (прямой вызов functions.yandexcloud.net без API Gateway)
  if (query.path) {
    const q = { ...query }
    delete q.path
    delete q.trackId
    const ymPath = String(query.path)
    return proxyYmApi(ymPath.startsWith('/') ? ymPath : `/${ymPath}`, q)
  }
  if (query.trackId) {
    try {
      return redirect(await resolveDirectUrl(String(query.trackId)))
    } catch (e) {
      return json(502, {
        error: 'yandex_stream_failed',
        message: e instanceof Error ? e.message : String(e),
        hint: 'Проверь YANDEX_MUSIC_TOKEN в переменных функции',
      })
    }
  }

  if (path === '/' || path === '/health') {
    return json(200, {
      ok: true,
      service: 'audioswipe-ym-proxy',
      hasToken: Boolean((process.env.YANDEX_MUSIC_TOKEN || '').trim()),
    })
  }

  // /ym-api/... (API Gateway)
  if (path.startsWith('/ym-api')) {
    const ymPath = path.slice('/ym-api'.length) || '/'
    const q = { ...query }
    delete q.integration
    return proxyYmApi(ymPath.startsWith('/') ? ymPath : `/${ymPath}`, q)
  }

  // /ym-stream/:trackId
  const streamMatch = path.match(/^\/ym-stream\/([^/]+)\/?$/)
  if (streamMatch) {
    try {
      const direct = await resolveDirectUrl(decodeURIComponent(streamMatch[1]))
      return redirect(direct)
    } catch (e) {
      return json(502, {
        error: 'yandex_stream_failed',
        message: e instanceof Error ? e.message : String(e),
        hint: 'Проверь YANDEX_MUSIC_TOKEN в переменных функции',
      })
    }
  }

  return json(404, {
    error: 'not_found',
    path,
    hint: 'Без API Gateway вызывай ?path=/landing3/chart или ?trackId=123',
  })
}
