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
import {
  checkDbConnection,
  DbUnavailableError,
  getLastDbError,
  query,
} from './db.js'

const app = express()
const PORT = Number(process.env.PORT ?? 3001)

// Разрешаем запросы с фронтенда на Vercel (+ локалка для разработки)
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
    if (!result.ok) {
      res.status(400).json({ error: result.error })
      return
    }
    res.status(201).json({ token: result.token, user: publicUser(result.user) })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({ error: 'База данных недоступна. Проверь DATABASE_URL на Render.' })
      return
    }
    console.error(e)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const login = String(req.body?.login ?? req.body?.email ?? '')
    const password = String(req.body?.password ?? '')
    const result = await loginUser(login, password)
    if (!result.ok) {
      res.status(401).json({ error: result.error })
      return
    }
    res.json({ token: result.token, user: publicUser(result.user) })
  } catch (e) {
    if (e instanceof DbUnavailableError) {
      res.status(503).json({ error: 'База данных недоступна. Проверь DATABASE_URL на Render.' })
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
    if (!result.ok) {
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
    if (!result.ok) {
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
    if (!result.ok) {
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
    if (!result.ok) {
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

async function main() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audioswipe API :${PORT}`)
  })

  try {
    await checkDbConnection()
    console.log('Database connected')
  } catch (e) {
    console.error('Database connection failed — auth routes will not work:', e)
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
