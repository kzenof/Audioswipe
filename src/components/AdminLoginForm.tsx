import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BackButton } from './BackButton'

interface Props {
  onSubmit: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>
}

export function AdminLoginForm({ onSubmit }: Props) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const result = await onSubmit(login, password)
      if (!result.ok) setError(result.error ?? 'Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <BackButton to="/" />
      <div className="admin-login__card">
        <Link to="/" className="brand-mini admin-login__brand">
          Audio<span>swipe</span>
        </Link>
        <h1>Вход в админку</h1>
        <p className="admin-login__sub">Только для администраторов</p>

        <form className="admin-login__form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>Логин</span>
            <input
              className="input"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              placeholder="admin_логин"
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              minLength={4}
              placeholder="••••••••"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
            {loading ? '…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
