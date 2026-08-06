import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import {
  findUserById,
  findUserByLogin,
  loginUser,
  publicUser,
  registerUser,
  requireAuth,
  authFromHeader,
} from './auth.js'
import { listUsers, mapAdminUser, requireAdmin, setCanUpload } from './admin.js'
import { addToBlacklist, listBlacklist } from './blacklist.js'
import {
  banArtistFromReport,
  createReport,
  dismissReport,
  listPendingReports,
  mapReport,
  REPORT_REASONS,
} from './reports.js'
import { updateUserProfile } from './profile.js'
import {
  checkDbConnection,
  DbUnavailableError,
  getLastDbError,
  query,
} from './db.js'
import { handleYmStream, registerYmApiProxy, registerYmHealth } from './yandexProxy.js'
import {
  getRadarTracks,
  normalizeRadarTier,
  parseExclude,
  parseGenres,
} from './radar.js'

const app = express()

app.use(
  cors({
    origin: [
      'https://audioswipe.vercel.app',
      'http://localhost:5173',
      ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
    ],
    credentials: true,
  }),
)
app.use(express.json())

registerYmApiProxy(app)
registerYmHealth(app)
app.get('/ym-stream/:trackId', handleYmStream)

app.get('/', (_req, res) => {
  res.json({
    service: 'audioswipe-api',
    ok: true,
    health: '/api/health',
    frontend: 'https://audioswipe.vercel.app',
  })
})

app.get('/api/health', async (_req, res) => {
  let db = false
  try {
    await query('SELECT 1')
    db = true
  } catch {
    db = false
  }
  res.json({
    ok: true,
    service: 'audioswipe-api',
    db,
    ymToken: Boolean(process.env.YANDEX_MUSIC_TOKEN?.trim()),
    ...(db ? {} : { hint: getLastDbError() ?? 'DB connection failed' }),
  })
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const login = String(req.body?.login ?? req.body?.email ?? '')
    const { password, role, artistName, mainRole, dawSoftware, statusTag } = req.body ?? {}
    if (role !== 'listener' && role !== 'artist') {
      res.status(400).json({ error: 'role: listener | artist' })
      return
    }
    const result = await registerUser({
      login,
      password: String(password ?? ''),
      role,
      artistName,
      mainRole,
      dawSoftware,
      statusTag,
    })
    if (result.ok === false) {
      res.status(400).json({ error: result.error })
      return
    }
    res.status(201).json({
      token: result.token,
      user: publicUser(result.user),
      isFirstUser: result.isFirstUser ?? false,
    })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({
        error: 'База данных недоступна. Проверь DATABASE_URL в Vercel Environment.',
      })
      return
    }
    console.error('POST /api/auth/register', e)
    const hint =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message: string }).message)
        : 'Ошибка сервера'
    res.status(500).json({ error: hint.slice(0, 200) })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const login = String(req.body?.login ?? req.body?.email ?? '')
    const password = String(req.body?.password ?? '')
    const result = await loginUser(login, password)
    if (result.ok === false) {
      res.status(401).json({ error: result.error })
      return
    }
    res.json({ token: result.token, user: publicUser(result.user) })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({
        error: 'База данных недоступна. Проверь DATABASE_URL в Vercel Environment.',
      })
      return
    }
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  const auth = requireAuth(req.headers.authorization, res)
  if (!auth) return
  const user = await findUserById(auth.userId)
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  res.json({ user: publicUser(user) })
})

app.get('/api/blacklist', async (req, res) => {
  const auth = requireAuth(req.headers.authorization, res)
  if (!auth) return
  res.json({ yandexArtistIds: await listBlacklist(auth.userId) })
})

app.post('/api/blacklist', async (req, res) => {
  const auth = requireAuth(req.headers.authorization, res)
  if (!auth) return
  const yandexArtistId = String(req.body?.yandexArtistId ?? req.body?.yandex_artist_id ?? '')
  if (!yandexArtistId.trim()) {
    res.status(400).json({ error: 'yandexArtistId обязателен' })
    return
  }
  const ids = await addToBlacklist(auth.userId, yandexArtistId)
  res.json({ yandexArtistIds: ids })
})

app.get('/api/reports/reasons', (_req, res) => {
  res.json({ reasons: REPORT_REASONS })
})

app.post('/api/reports', async (req, res) => {
  try {
    const auth = requireAuth(req.headers.authorization, res)
    if (!auth) return

    const reason = String(req.body?.reason ?? '')
    const trackId = String(req.body?.trackId ?? req.body?.track_id ?? '')
    const trackTitle = String(req.body?.trackTitle ?? req.body?.track_title ?? '')
    const reportedLogin = String(req.body?.reportedLogin ?? req.body?.reported_login ?? '')

    let reportedUserId: number | null = null
    if (reportedLogin.trim()) {
      const target = await findUserByLogin(reportedLogin)
      reportedUserId = target?.id ?? null
    } else if (req.body?.reportedUserId != null) {
      reportedUserId = Number(req.body.reportedUserId)
    }

    const result = await createReport({
      reporterId: auth.userId,
      reportedUserId,
      trackId: trackId || undefined,
      trackTitle: trackTitle || undefined,
      reason,
    })
    if (result.ok === false) {
      res.status(400).json({ error: result.error })
      return
    }
    res.status(201).json({ ok: true })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({ error: 'База данных недоступна' })
      return
    }
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.get('/api/admin/users', async (req, res) => {
  try {
    const auth = requireAdmin(req.headers.authorization, res)
    if (!auth) return
    const search = String(req.query.search ?? req.query.q ?? '')
    const users = await listUsers(search)
    res.json({ users: users.map(mapAdminUser) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.patch('/api/admin/users/:id/upload', async (req, res) => {
  try {
    const auth = requireAdmin(req.headers.authorization, res)
    if (!auth) return
    const userId = Number(req.params.id)
    const canUpload = Boolean(req.body?.canUpload ?? req.body?.can_upload)
    const result = await setCanUpload(userId, canUpload)
    if (result.ok === false) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ user: publicUser(result.user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.get('/api/admin/reports', async (req, res) => {
  try {
    const auth = requireAdmin(req.headers.authorization, res)
    if (!auth) return
    const reports = await listPendingReports()
    res.json({ reports: reports.map(mapReport) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.delete('/api/admin/reports/:id', async (req, res) => {
  try {
    const auth = requireAdmin(req.headers.authorization, res)
    if (!auth) return
    const result = await dismissReport(Number(req.params.id))
    if (result.ok === false) {
      res.status(404).json({ error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.post('/api/admin/reports/:id/ban', async (req, res) => {
  try {
    const auth = requireAdmin(req.headers.authorization, res)
    if (!auth) return
    const result = await banArtistFromReport(Number(req.params.id))
    if (result.ok === false) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.get('/api/auth/upload-check', async (req, res) => {
  const auth = requireAuth(req.headers.authorization, res)
  if (!auth) return
  const user = await findUserById(auth.userId)
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  if (user.can_upload === false) {
    res.status(403).json({
      allowed: false,
      error: 'Вы заблокированы за нарушение правил',
    })
    return
  }
  res.json({ allowed: true })
})

app.patch('/api/users/me/profile', async (req, res) => {
  try {
    const auth = requireAuth(req.headers.authorization, res)
    if (!auth) return

    const body = req.body ?? {}
    const result = await updateUserProfile(auth.userId, {
      artistName: body.artistName ?? body.artist_name,
      avatarUrl: body.avatarUrl ?? body.avatar_url,
      mainRole: body.mainRole ?? body.main_role,
      dawSoftware: body.dawSoftware ?? body.daw_software,
      statusTag: body.statusTag ?? body.status_tag,
      social: body.social ?? body.socialLinks ?? body.social_links,
    })
    if (result.ok === false) {
      res.status(400).json({ error: result.error })
      return
    }
    res.json({ user: publicUser(result.user) })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({ error: 'База данных недоступна' })
      return
    }
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.get('/api/radar', async (req, res) => {
  try {
    const auth = authFromHeader(req.headers.authorization)
    const tier = normalizeRadarTier(req.query.tier ?? req.query.bucket)
    const genres = parseGenres(req.query.genres ?? req.query.genre)
    const limit = Math.min(Math.max(Number(req.query.limit ?? 5) || 5, 1), 20)
    const excludeIds = parseExclude(req.query.exclude ?? req.query.excludeIds)

    const result = await getRadarTracks({
      userId: auth?.userId ?? null,
      tier,
      genres,
      limit,
      excludeIds,
    })

    if (!result.success) {
      res.status(
        result.error.includes('YANDEX') ? 503 : 502,
      ).json(result)
      return
    }

    res.json(result)
  } catch (e) {
    console.error('GET /api/radar', e)
    const msg = e instanceof Error ? e.message : 'Radar error'
    res.status(500).json({ success: false, error: msg })
  }
})

/** Прогрев пула БД (локально / при cold start). На Vercel вызывается лениво в query(). */
export async function warmDb() {
  try {
    await checkDbConnection()
    console.log('Database connected')
  } catch (e) {
    console.error('Database connection failed — auth routes will not work:', e)
  }
}

export default app
