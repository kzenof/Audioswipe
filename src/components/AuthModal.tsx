import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../context/AppContext'
import type { Role } from '../types'

interface Props {
  intendedRole: Exclude<Role, null>
  onClose: () => void
}

export function AuthModal({ intendedRole, onClose }: Props) {
  const { login, register } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [loginValue, setLoginValue] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const loginRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loginRef.current?.focus()
  }, [mode])

  const title =
    intendedRole === 'listener' ? 'Вход слушателя' : 'Вход артиста'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result =
        mode === 'login'
          ? await login(loginValue, password, intendedRole)
          : await register(loginValue, password, intendedRole)
      if (result.ok === false) {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="auth-title"
      >
        <h2 id="auth-title">{title}</h2>
        <p className="modal__sub">
          {mode === 'login'
            ? 'Вход по логину и паролю.'
            : 'Создай аккаунт — данные сохраняются в PostgreSQL.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'is-active' : ''}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-modal__form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="field">
            <span>Логин (email)</span>
            <input
              ref={loginRef}
              className="input"
              type="email"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              autoComplete="username"
              required
              placeholder="you@mail.com"
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={4}
              placeholder="••••••••"
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
            {loading ? '…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <button type="button" className="modal__close" onClick={onClose}>
          закрыть
        </button>
      </div>
    </div>
  )
}
