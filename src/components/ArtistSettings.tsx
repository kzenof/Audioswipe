import { useState } from 'react'
import { useApp } from '../context/AppContext'
import type { ArtistRole, FitStatus, Soft } from '../types'
import { SOCIAL_PLATFORMS } from '../types'

const ROLES: ArtistRole[] = ['Битмейкер', 'Вокалист', 'Сонграйтер', 'Звукарь']
const SOFTS: Soft[] = ['FL Studio', 'Ableton', 'Logic', 'Pro Tools', 'Cubase']
const STATUSES: FitStatus[] = [
  'Ищу бит для альбома',
  'За респект',
  'Коммерческий заказ',
  'Открыт к фитам',
  'Не ищу коллабы',
]

export function ArtistSettings() {
  const { collabProfile, setCollabProfile, saveArtistProfile, user } = useApp()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const toggleSoft = (s: Soft) => {
    const has = collabProfile.soft.includes(s)
    setCollabProfile({
      ...collabProfile,
      soft: has
        ? collabProfile.soft.filter((x) => x !== s)
        : [...collabProfile.soft, s],
    })
  }

  const regenerateAvatar = () => {
    const seed = collabProfile.name || user || 'artist'
    setCollabProfile({
      ...collabProfile,
      avatar: `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0a0a12`,
    })
  }

  const onAvatarFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (url.length > 500_000) {
        setMessage('Картинка слишком большая — вставь ссылку на аватар')
        return
      }
      setCollabProfile({ ...collabProfile, avatar: url })
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await saveArtistProfile()
      setMessage('Профиль сохранён')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="artist-settings">
      <h2>Настройки профиля</h2>
      <p className="artist-settings__hint">
        Ник, аватар и соцсети видны слушателям после раскрытия трека.
      </p>

      <div className="artist-settings__avatar-row">
        <img src={collabProfile.avatar} alt="" className="artist-settings__avatar" />
        <div className="artist-settings__avatar-controls">
          <label className="field">
            <span>Аватар (ссылка)</span>
            <input
              className="input"
              value={collabProfile.avatar}
              onChange={(e) =>
                setCollabProfile({ ...collabProfile, avatar: e.target.value })
              }
              placeholder="https://…"
            />
          </label>
          <div className="chip-row">
            <label className="btn btn--ghost btn--sm">
              Загрузить фото
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onAvatarFile(e.target.files?.[0])}
              />
            </label>
            <button type="button" className="btn btn--ghost btn--sm" onClick={regenerateAvatar}>
              Сгенерировать
            </button>
          </div>
        </div>
      </div>

      <div className="fit-profile__grid">
        <label className="field">
          <span>Ник / имя артиста</span>
          <input
            className="input"
            value={collabProfile.name}
            onChange={(e) => setCollabProfile({ ...collabProfile, name: e.target.value })}
          />
        </label>

        <div className="field">
          <span>Роль</span>
          <div className="chip-row">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={`chip ${collabProfile.role === r ? 'is-on' : ''}`}
                onClick={() => setCollabProfile({ ...collabProfile, role: r })}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Софт</span>
          <div className="chip-row">
            {SOFTS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${collabProfile.soft.includes(s) ? 'is-on' : ''}`}
                onClick={() => toggleSoft(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Статус</span>
          <div className="chip-row">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip ${collabProfile.status === s ? 'is-on' : ''}`}
                onClick={() => setCollabProfile({ ...collabProfile, status: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="field field--full">
          <span>О себе</span>
          <textarea
            className="input input--area"
            rows={2}
            value={collabProfile.bio}
            onChange={(e) => setCollabProfile({ ...collabProfile, bio: e.target.value })}
          />
        </label>
      </div>

      <div className="artist-settings__social">
        <h3>Соцсети и стриминги</h3>
        <p className="artist-settings__hint">
          Ссылки прикрепятся к твоим трекам и появятся у слушателей после прослушивания.
        </p>
        <div className="social-fields">
          {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                className="input"
                value={collabProfile.social[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) =>
                  setCollabProfile({
                    ...collabProfile,
                    social: { ...collabProfile.social, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="artist-settings__footer">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Сохраняем…' : 'Сохранить профиль'}
        </button>
        {message && <p className="artist-settings__msg">{message}</p>}
      </div>
    </section>
  )
}
