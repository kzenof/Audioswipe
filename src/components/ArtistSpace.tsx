import { useEffect, useMemo, useState } from 'react'
import { FIT_FEED } from '../data/mock'
import { useApp } from '../context/AppContext'
import type { ArtistRole, Soft, FitStatus } from '../types'
import { ArtistSettings } from './ArtistSettings'
import { TrackUploadPanel } from './TrackUploadPanel'
import { RetentionChart } from './RetentionChart'

const ROLES: ArtistRole[] = ['Битмейкер', 'Вокалист', 'Сонграйтер', 'Звукарь']
const SOFTS: Soft[] = ['FL Studio', 'Ableton', 'Logic', 'Pro Tools', 'Cubase']
const STATUSES: FitStatus[] = [
  'Ищу бит для альбома',
  'За респект',
  'Коммерческий заказ',
  'Открыт к фитам',
  'Не ищу коллабы',
]

export function ArtistSpace() {
  const {
    artistTab,
    setArtistTab,
    fitView,
    setFitView,
    collabProfile,
    setCollabProfile,
    myTracks,
    addMyTrack,
    focusFeedback,
    setFocusFeedback,
    proposeFit,
    proposals,
    acceptProposal,
    openChat,
    switchToListener,
    goHome,
    user,
    logout,
    canUpload,
    getTrackReviews,
    refreshArtistStats,
  } = useApp()

  useEffect(() => {
    if (artistTab === 'music') refreshArtistStats()
  }, [refreshArtistStats, artistTab])

  const [genreFilter, setGenreFilter] = useState('Все')
  const [softFilter, setSoftFilter] = useState('Все')
  const [selectedTrack, setSelectedTrack] = useState('')
  const [refTitle, setRefTitle] = useState('')
  const [refGenre, setRefGenre] = useState('')

  useEffect(() => {
    if (!selectedTrack && myTracks[0]) setSelectedTrack(myTracks[0].id)
    if (selectedTrack && !myTracks.some((t) => t.id === selectedTrack)) {
      setSelectedTrack(myTracks[0]?.id ?? '')
    }
  }, [myTracks, selectedTrack])

  const activeTrack = myTracks.find((t) => t.id === selectedTrack) ?? myTracks[0]
  const trackReviews = activeTrack ? getTrackReviews(activeTrack.id) : []

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60_000) return 'только что'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}м назад`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}ч назад`
    return `${Math.floor(diff / 86_400_000)}д назад`
  }

  const genres = useMemo(() => {
    const g = new Set<string>()
    FIT_FEED.forEach((f) => f.genres.forEach((x) => g.add(x)))
    return ['Все', ...g]
  }, [])

  const filtered = FIT_FEED.filter((f) => {
    if (genreFilter !== 'Все' && !f.genres.includes(genreFilter)) return false
    if (softFilter !== 'Все' && !f.soft.includes(softFilter as Soft)) return false
    return true
  })

  const toggleSoft = (s: Soft) => {
    const has = collabProfile.soft.includes(s)
    setCollabProfile({
      ...collabProfile,
      soft: has
        ? collabProfile.soft.filter((x) => x !== s)
        : [...collabProfile.soft, s],
    })
  }

  const addReference = () => {
    if (!refTitle.trim() || collabProfile.references.length >= 3) return
    setCollabProfile({
      ...collabProfile,
      references: [
        ...collabProfile.references,
        {
          id: `r-${Date.now()}`,
          title: refTitle.trim(),
          genre: refGenre.trim() || '—',
        },
      ],
    })
    setRefTitle('')
    setRefGenre('')
  }

  return (
    <div className="space artist-space">
      <header className="space-nav">
        <button type="button" className="brand-mini" onClick={goHome}>
          Audio<span>swipe</span>
        </button>
        <nav className="space-nav__tabs">
          <button
            type="button"
            className={artistTab === 'music' ? 'is-active' : ''}
            onClick={() => setArtistTab('music')}
          >
            Моя Музыка
          </button>
          <button
            type="button"
            className={artistTab === 'fit' ? 'is-active' : ''}
            onClick={() => setArtistTab('fit')}
          >
            Искать Фит
          </button>
          <button
            type="button"
            className={artistTab === 'settings' ? 'is-active' : ''}
            onClick={() => setArtistTab('settings')}
          >
            Настройки
          </button>
        </nav>
        <div className="space-nav__user">
          <span className="user-chip">{user}</span>
          <button type="button" className="link-switch" onClick={switchToListener}>
            Режим слушателя →
          </button>
          <button type="button" className="link-switch" onClick={logout}>
            выйти
          </button>
        </div>
      </header>

      {artistTab === 'music' && (
        <section className="studio">
          <TrackUploadPanel
            canUpload={canUpload}
            focusFeedback={focusFeedback}
            onFocusFeedbackChange={setFocusFeedback}
            onPublish={addMyTrack}
          />

          <div className="studio__tracks">
            <h3>Твои релизы</h3>
            {myTracks.length === 0 ? (
              <p className="empty empty--sm">Пока нет треков — загрузи первый файл.</p>
            ) : (
              <ul className="track-picker">
                {myTracks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={selectedTrack === t.id ? 'is-active' : ''}
                      onClick={() => setSelectedTrack(t.id)}
                    >
                      <strong>{t.title}</strong>
                      <span>
                        {t.genre} · фрагмент с {t.previewStartSec ?? 0} сек
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeTrack ? (
            <div className="studio__analytics">
              <h3>Удержание · {activeTrack.title}</h3>
              <p className="studio__focus-live">Фокус: «{focusFeedback}»</p>
              {activeTrack.skipCurve.length > 0 ? (
                <RetentionChart data={activeTrack.skipCurve} />
              ) : (
                <p className="empty empty--sm">
                  График появится, когда слушатели начнут оценивать трек.
                </p>
              )}
              <div className="reviews">
                <h4>Отзывы слушателей</h4>
                {trackReviews.length === 0 ? (
                  <p className="empty empty--sm">
                    Отзывов пока нет. Когда слушатель оставит коммент в радаре
                    «Локальные» — он появится здесь.
                  </p>
                ) : (
                  <ul>
                    {trackReviews.map((r) => (
                      <li key={r.id}>
                        <span className="reviews__emoji">
                          {r.emojis[0] || '💬'}
                        </span>
                        <div>
                          <p>
                            {r.comment || '(без текста)'}{' '}
                            {r.emojis.length > 0 && (
                              <span>{r.emojis.join(' ')}</span>
                            )}
                          </p>
                          <time>
                            @{r.fromUser} · {formatTime(r.timestamp)}
                            {r.liked ? ' · лайк' : ''}
                            {r.listenedToEnd ? ' · дослушал' : ''}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="studio__analytics">
              <h3>Аналитика</h3>
              <p className="empty empty--sm">Загрузи трек, чтобы видеть удержание и отзывы.</p>
            </div>
          )}
        </section>
      )}

      {artistTab === 'settings' && <ArtistSettings />}

      {artistTab === 'fit' && (
        <section className="fit">
          <div className="fit__subnav">
            <button
              type="button"
              className={fitView === 'feed' ? 'is-active' : ''}
              onClick={() => setFitView('feed')}
            >
              Лента поиска
            </button>
            <button
              type="button"
              className={fitView === 'profile' ? 'is-active' : ''}
              onClick={() => setFitView('profile')}
            >
              Мой профиль для фитов
            </button>
          </div>

          {fitView === 'profile' && (
            <div className="fit-profile">
              <h2>Профиль за 1 минуту</h2>
              <div className="fit-profile__grid">
                <label className="field">
                  <span>Имя / ник</span>
                  <input
                    className="input"
                    value={collabProfile.name}
                    onChange={(e) =>
                      setCollabProfile({ ...collabProfile, name: e.target.value })
                    }
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
                        onClick={() =>
                          setCollabProfile({ ...collabProfile, status: s })
                        }
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
                    onChange={(e) =>
                      setCollabProfile({ ...collabProfile, bio: e.target.value })
                    }
                  />
                </label>
                <div className="field field--full">
                  <span>Стена референсов (до 3)</span>
                  {collabProfile.references.length === 0 && (
                    <p className="empty empty--sm">Референсов пока нет.</p>
                  )}
                  <ul className="ref-wall">
                    {collabProfile.references.map((r) => (
                      <li key={r.id}>
                        <strong>{r.title}</strong>
                        <span>{r.genre}</span>
                      </li>
                    ))}
                  </ul>
                  {collabProfile.references.length < 3 && (
                    <div className="ref-add">
                      <input
                        className="input"
                        placeholder="Название трека"
                        value={refTitle}
                        onChange={(e) => setRefTitle(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Жанр"
                        value={refGenre}
                        onChange={(e) => setRefGenre(e.target.value)}
                      />
                      <button type="button" className="btn btn--ghost" onClick={addReference}>
                        Добавить
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button type="button" className="btn btn--primary" onClick={() => setFitView('feed')}>
                Сохранить и в ленту
              </button>
            </div>
          )}

          {fitView === 'feed' && (
            <div className="fit-feed">
              <div className="fit-feed__filters">
                <label>
                  Жанр
                  <select
                    className="input"
                    value={genreFilter}
                    onChange={(e) => setGenreFilter(e.target.value)}
                  >
                    {genres.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Софт
                  <select
                    className="input"
                    value={softFilter}
                    onChange={(e) => setSoftFilter(e.target.value)}
                  >
                    <option>Все</option>
                    {SOFTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <ul className="fit-cards">
                {filtered.map((f) => (
                  <li key={f.id} className="fit-card">
                    <img src={f.avatar} alt="" />
                    <div className="fit-card__body">
                      <div className="fit-card__top">
                        <strong>{f.name}</strong>
                        <span className="fit-card__role">{f.role}</span>
                      </div>
                      <p className="fit-card__hint">{f.styleHint}</p>
                      <div className="fit-card__tags">
                        {f.genres.map((g) => (
                          <span key={g}>{g}</span>
                        ))}
                        {f.soft.map((s) => (
                          <span key={s} className="soft">
                            {s}
                          </span>
                        ))}
                      </div>
                      <p className="fit-card__status">{f.status}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--neon"
                      onClick={() => proposeFit({ id: f.id, name: f.name })}
                    >
                      Предложить фит
                    </button>
                  </li>
                ))}
              </ul>
              {proposals.length === 0 ? (
                <p className="empty empty--sm" style={{ marginTop: '1.5rem' }}>
                  Предложений фита пока нет.
                </p>
              ) : (
                <div className="proposals">
                  <h3>Твои предложения</h3>
                  <ul>
                    {proposals.map((p) => (
                      <li key={p.id}>
                        <span>
                          → {p.toName} ·{' '}
                          <em>
                            {p.status === 'pending'
                              ? 'ожидает'
                              : p.status === 'accepted'
                                ? 'принято'
                                : 'отклонено'}
                          </em>
                        </span>
                        {p.status === 'pending' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              acceptProposal(p.id)
                              openChat(p.toName)
                            }}
                          >
                            Симулировать принятие
                          </button>
                        )}
                        {p.status === 'accepted' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => openChat(p.toName)}
                          >
                            Открыть чат
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
