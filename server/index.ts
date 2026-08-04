import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import {
  findUserById,
  loginUser,
  publicUser,
  registerUser,
  requireAuth,
} from './auth.js'
import { addToBlacklist, listBlacklist } from './blacklist.js'
import { checkDbConnection, query } from './db.js'

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
  res.json({ ok: true, service: 'audioswipe-api', db })
})

app.post('/api/auth/register', async (req, res) => {
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
})

app.post('/api/auth/login', async (req, res) => {
  const login = String(req.body?.login ?? req.body?.email ?? '')
  const password = String(req.body?.password ?? '')
  const result = await loginUser(login, password)
  if (!result.ok) {
    res.status(401).json({ error: result.error })
    return
  }
  res.json({ token: result.token, user: publicUser(result.user) })
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
