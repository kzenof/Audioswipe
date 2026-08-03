import { useState } from 'react'
import { NeonWave } from './NeonWave'
import { AuthModal } from './AuthModal'
import { useApp } from '../context/AppContext'
import type { Role } from '../types'

export function WelcomeScreen() {
  const { user, logout, switchToListener, switchToArtist } = useApp()
  const [authRole, setAuthRole] = useState<Exclude<Role, null> | null>(null)

  const enterListener = () => {
    if (user) switchToListener()
    else setAuthRole('listener')
  }

  const enterArtist = () => {
    if (user) switchToArtist()
    else setAuthRole('artist')
  }

  return (
    <section className="welcome">
      <div className="welcome__bg" aria-hidden>
        <NeonWave seed={11} playing intensity={1.15} className="welcome__wave" />
        <div className="welcome__grid" />
        <div className="welcome__vignette" />
      </div>

      <div className="welcome__content">
        <p className="welcome__eyebrow">blind listen · open collab</p>
        <h1 className="welcome__brand">
          Audio<span className="welcome__brand-dot">swipe</span>
        </h1>
        <p className="welcome__tagline">
          Слушай вслепую. Открывай ноунеймов. Собирай фиты.
        </p>

        {user && (
          <p className="welcome__session">
            Аккаунт <strong>{user}</strong>
            <button type="button" className="link-switch" onClick={logout}>
              выйти
            </button>
          </p>
        )}

        <div className="welcome__actions">
          <button
            type="button"
            className="welcome__btn welcome__btn--listener"
            onClick={enterListener}
          >
            <span className="welcome__btn-label">Я Слушатель</span>
            <span className="welcome__btn-hint">
              {user ? 'открыть кабинет слушателя' : 'вход по логину и паролю'}
            </span>
          </button>
          <button
            type="button"
            className="welcome__btn welcome__btn--artist"
            onClick={enterArtist}
          >
            <span className="welcome__btn-label">Я Артист</span>
            <span className="welcome__btn-hint">
              {user ? 'открыть кабинет артиста' : 'вход по логину и паролю'}
            </span>
          </button>
        </div>
      </div>

      {authRole && (
        <AuthModal intendedRole={authRole} onClose={() => setAuthRole(null)} />
      )}
    </section>
  )
}
