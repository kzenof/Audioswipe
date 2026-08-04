import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { BackButton } from './BackButton'
import {
  apiAdminBanFromReport,
  apiAdminDismissReport,
  apiAdminReports,
  apiAdminSetUpload,
  apiAdminUsers,
} from '../lib/api'
import type { AdminUserRow, PlatformReport } from '../types'
import { NotFoundPage } from './NotFoundPage'

type AdminTab = 'users' | 'reports'

export function AdminZone() {
  const { accountRole, authToken, logout, cabinetReady, refreshProfile } = useApp()
  const [tab, setTab] = useState<AdminTab>('users')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [reports, setReports] = useState<PlatformReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [accessChecked, setAccessChecked] = useState(false)

  useEffect(() => {
    if (!cabinetReady) return
    void (async () => {
      await refreshProfile()
      setAccessChecked(true)
    })()
  }, [cabinetReady, refreshProfile])

  const loadUsers = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const { users: rows } = await apiAdminUsers(authToken, search)
      setUsers(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [authToken, search])

  const loadReports = useCallback(async () => {
    if (!authToken) return
    setLoading(true)
    setError('')
    try {
      const { reports: rows } = await apiAdminReports(authToken)
      setReports(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => {
    if (accountRole !== 'admin' || !authToken) return
    if (tab === 'users') void loadUsers()
    else void loadReports()
  }, [accountRole, authToken, tab, loadUsers, loadReports])

  if (!cabinetReady || !accessChecked) {
    return (
      <div className="admin-zone admin-zone--checking">
        <p className="admin-zone__loading">Проверка доступа…</p>
      </div>
    )
  }

  if (accountRole !== 'admin') {
    return <NotFoundPage />
  }

  const toggleUpload = async (user: AdminUserRow) => {
    if (!authToken) return
    try {
      await apiAdminSetUpload(authToken, user.id, !user.canUpload)
      void loadUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить')
    }
  }

  const dismissReport = async (id: number) => {
    if (!authToken) return
    try {
      await apiAdminDismissReport(authToken, id)
      void loadReports()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const banFromReport = async (id: number) => {
    if (!authToken) return
    try {
      await apiAdminBanFromReport(authToken, id)
      void loadReports()
      if (tab === 'users') void loadUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  return (
    <div className="admin-zone">
      <BackButton />
      <header className="admin-zone__head">
        <Link to="/" className="brand-mini">
          Audio<span>swipe</span>
        </Link>
        <h1>Админка</h1>
        <div className="admin-zone__actions">
          <button type="button" className="link-switch" onClick={logout}>
            выйти
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button
          type="button"
          className={tab === 'users' ? 'is-active' : ''}
          onClick={() => setTab('users')}
        >
          Пользователи
        </button>
        <button
          type="button"
          className={tab === 'reports' ? 'is-active' : ''}
          onClick={() => setTab('reports')}
        >
          Жалобы
        </button>
      </nav>

      {error && <p className="auth-error admin-zone__error">{error}</p>}

      {tab === 'users' && (
        <section className="admin-panel">
          <label className="field admin-search">
            <span>Поиск по нику / логину</span>
            <input
              className="input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="artist_name или login…"
            />
          </label>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Логин</th>
                  <th>Ник</th>
                  <th>Роль</th>
                  <th>Публикация</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.login}</td>
                    <td>{u.artistName ?? '—'}</td>
                    <td>{u.role}</td>
                    <td>
                      {u.role === 'artist' || u.role === 'admin' ? (
                        <button
                          type="button"
                          className={`admin-toggle ${u.canUpload ? 'is-on' : 'is-off'}`}
                          disabled={u.role === 'admin'}
                          onClick={() => void toggleUpload(u)}
                        >
                          {u.canUpload ? 'Разрешено' : 'Запрещено'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <p className="admin-zone__loading">Загрузка…</p>}
            {!loading && users.length === 0 && (
              <p className="admin-zone__empty">Пользователи не найдены</p>
            )}
          </div>
        </section>
      )}

      {tab === 'reports' && (
        <section className="admin-panel">
          <div className="admin-reports">
            {reports.map((r) => (
              <article key={r.id} className="admin-report-card">
                <p className="admin-report-card__line">
                  <strong>{r.reporterLogin}</strong> пожаловался на{' '}
                  <strong>{r.reportedArtistName ?? r.reportedLogin ?? 'неизвестного артиста'}</strong>
                </p>
                <p className="admin-report-card__meta">
                  {r.trackTitle ? `Трек: «${r.trackTitle}» · ` : ''}
                  Причина: {r.reason}
                </p>
                <div className="admin-report-card__actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void dismissReport(r.id)}
                  >
                    Удалить жалобу
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => void banFromReport(r.id)}
                  >
                    Забанить артиста
                  </button>
                </div>
              </article>
            ))}
            {loading && <p className="admin-zone__loading">Загрузка…</p>}
            {!loading && reports.length === 0 && (
              <p className="admin-zone__empty">Нет жалоб со статусом pending</p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
