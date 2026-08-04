import { useEffect, useRef, useState } from 'react'
import { NeonWave } from './NeonWave'
import { RadarScreen } from './RadarScreen'
import { ReportModal } from './ReportModal'
import { EMOJI_TAGS } from '../data/mock'
import { useApp } from '../context/AppContext'
import { POPULARITY_LABELS, SOCIAL_PLATFORMS, getTrackPreviewWindow } from '../types'
import { formatListeners, yandexEmbedUrl, yandexStreamUrl } from '../lib/yandex'

type Tab = 'scout' | 'finds'

export function ListenerSpace() {
  const {
    currentTrack,
    listenerPhase,
    discoveries,
    likeTrack,
    skipTrack,
    blockArtist,
    submitReport,
    submitFeedback,
    addToFinds,
    nextTrack,
    markListenedToEnd,
    proposeFit,
    switchToArtist,
    goHome,
    user,
    logout,
    openRadar,
    radar,
    setListenProgress,
    bufferLoading,
  } = useApp()

  const [tab, setTab] = useState<Tab>('scout')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [revealBurst, setRevealBurst] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [findsPlaying, setFindsPlaying] = useState<string | null>(null)
  const [embedFallback, setEmbedFallback] = useState(false)
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hiddenAudioRef = useRef<HTMLAudioElement | null>(null)

  const stopTimers = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopAllAudio = () => {
    stopTimers()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const ha = hiddenAudioRef.current
    if (ha) {
      ha.pause()
      ha.removeAttribute('src')
      ha.load()
    }
  }

  useEffect(() => {
    if (listenerPhase === 'roulette' || listenerPhase === 'radar') {
      setPlaying(false)
      setProgress(0)
      setSelectedEmojis([])
      setComment('')
      setRevealBurst(false)
      setEmbedFallback(false)
      stopAllAudio()
    }
  }, [listenerPhase, currentTrack?.id])

  useEffect(() => {
    if (listenerPhase === 'reveal') {
      setRevealBurst(true)
      stopAllAudio()
      const t = window.setTimeout(() => setRevealBurst(false), 900)
      return () => window.clearTimeout(t)
    }
  }, [listenerPhase])

  useEffect(() => {
    if (!playing) {
      audioRef.current?.pause()
      hiddenAudioRef.current?.pause()
    }
  }, [playing])

  useEffect(() => {
    if (!playing || !currentTrack || listenerPhase !== 'roulette') return

    let cancelled = false
    stopTimers()

    const bindAudioProgress = (
      audio: HTMLAudioElement,
      previewStart = 0,
      clipLen = audio.duration || 1,
    ) => {
      timerRef.current = window.setInterval(() => {
        if (!clipLen || !Number.isFinite(clipLen)) return
        const elapsed = Math.max(0, audio.currentTime - previewStart)
        const p = Math.min(1, elapsed / clipLen)
        setProgress(p)
        setListenProgress(p)
        if (audio.currentTime >= previewStart + clipLen - 0.05) {
          audio.pause()
          setProgress(1)
          setListenProgress(1)
          setPlaying(false)
          markListenedToEnd()
        }
      }, 50)
      audio.onended = () => {
        setProgress(1)
        setListenProgress(1)
        setPlaying(false)
        markListenedToEnd()
      }
    }

    const playHidden = async (src: string) => {
      const el = hiddenAudioRef.current
      if (!el) return false
      el.src = src
      el.currentTime = 0
      try {
        await el.play()
        if (cancelled) {
          el.pause()
          return false
        }
        bindAudioProgress(el)
        return true
      } catch {
        return false
      }
    }

    const run = async () => {
      // Путь 1: Яндекс → скрытый <audio> через /ym-stream (download-info → mp3)
      if (currentTrack.source === 'yandex' && currentTrack.yandexTrackId) {
        const ok = await playHidden(yandexStreamUrl(currentTrack.yandexTrackId))
        if (!ok && !cancelled) {
          // без OAuth Яндекс даёт no-rights — официальный iframe как запасной путь
          setEmbedFallback(true)
          setPlaying(true)
          setProgress(0)
          const clip = Math.min(currentTrack.duration || 30, 45)
          const started = Date.now()
          timerRef.current = window.setInterval(() => {
            const p = Math.min(1, (Date.now() - started) / (clip * 1000))
            setProgress(p)
            setListenProgress(p)
            if (p >= 1) {
              stopTimers()
              setPlaying(false)
              markListenedToEnd()
            }
          }, 50)
        }
        return
      }

      // SoundLink / локальный файл
      if (currentTrack.audioUrl) {
        const { start, clipLen } = getTrackPreviewWindow(currentTrack)
        const audio = new Audio(currentTrack.audioUrl)
        audioRef.current = audio
        try {
          audio.currentTime = start
          await audio.play()
          if (cancelled) {
            audio.pause()
            return
          }
          bindAudioProgress(audio, start, clipLen)
        } catch {
          if (!cancelled) setPlaying(false)
        }
        return
      }

      setPlaying(false)
    }

    void run()

    return () => {
      cancelled = true
      stopTimers()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      const ha = hiddenAudioRef.current
      if (ha) {
        ha.pause()
      }
    }
  }, [playing, currentTrack, listenerPhase, markListenedToEnd, setListenProgress])

  const toggleEmoji = (e: string) => {
    setSelectedEmojis((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e].slice(0, 4),
    )
  }

  const onPlayToggle = () => {
    const ha = hiddenAudioRef.current
    if (playing) {
      ha?.pause()
      audioRef.current?.pause()
      setPlaying(false)
      return
    }
    // продолжить тот же поток без перезагрузки
    if (
      currentTrack?.source === 'yandex' &&
      ha &&
      ha.src &&
      !ha.ended &&
      ha.currentTime > 0
    ) {
      void ha.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(true))
      return
    }
    setPlaying(true)
  }

  return (
    <div className="space listener-space">
      {/* Путь 1: скрытый аудиопоток Яндекса — без названия на экране */}
      <audio ref={hiddenAudioRef} id="hidden-player" preload="none" hidden />

      {embedFallback &&
        currentTrack?.source === 'yandex' &&
        currentTrack.yandexTrackId &&
        listenerPhase === 'roulette' && (
          <div
            className="ym-embed-fallback"
            style={{
              position: 'fixed',
              left: 12,
              right: 12,
              bottom: 12,
              zIndex: 40,
              maxWidth: 420,
              margin: '0 auto',
            }}
          >
            <iframe
              title="Yandex Music preview"
              src={yandexEmbedUrl(currentTrack.yandexTrackId, currentTrack.yandexAlbumId)}
              width="100%"
              height="120"
              frameBorder="0"
              allow="clipboard-write; autoplay"
              style={{ borderRadius: 12, border: '0', display: 'block' }}
            />
          </div>
        )}

      <header className="space-nav">
        <button type="button" className="brand-mini" onClick={goHome}>
          Audio<span>swipe</span>
        </button>
        <nav className="space-nav__tabs">
          <button
            type="button"
            className={tab === 'scout' ? 'is-active' : ''}
            onClick={() => setTab('scout')}
          >
            Радар
          </button>
          <button
            type="button"
            className={tab === 'finds' ? 'is-active' : ''}
            onClick={() => setTab('finds')}
          >
            Мои находки
            {discoveries.length > 0 && (
              <span className="badge">{discoveries.length}</span>
            )}
          </button>
        </nav>
        <div className="space-nav__user">
          <span className="user-chip">{user}</span>
          <button type="button" className="link-switch" onClick={switchToArtist}>
            Режим артиста →
          </button>
          <button type="button" className="link-switch" onClick={logout}>
            выйти
          </button>
        </div>
      </header>

      {tab === 'scout' && listenerPhase === 'radar' && <RadarScreen />}

      {tab === 'scout' && listenerPhase !== 'radar' && !currentTrack && (
        <section className="radar">
          <p className="empty">
            {bufferLoading ? 'Подгружаем следующие треки…' : 'Очередь пуста.'}
          </p>
          {!bufferLoading && (
            <button type="button" className="btn btn--primary" onClick={openRadar}>
              Настроить радар
            </button>
          )}
        </section>
      )}

      {tab === 'scout' && listenerPhase === 'roulette' && currentTrack && (
        <section className="roulette">
          <div className="roulette__stage">
            <button type="button" className="radar-mini-link" onClick={openRadar}>
              ← {POPULARITY_LABELS[radar.popularity].title}
              {radar.genres.length > 0 ? ` · ${radar.genres.join(', ')}` : ''}
            </button>
            <div className="roulette__viz">
              <NeonWave
                seed={currentTrack.waveSeed}
                playing={playing}
                intensity={playing ? 1.2 : 0.4}
              />
            </div>
            <div className="roulette__timer" aria-hidden>
              <div
                className="roulette__timer-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <button
              type="button"
              className={`play-orb ${playing ? 'is-playing' : ''}`}
              onClick={onPlayToggle}
              aria-label={playing ? 'Пауза' : 'Play'}
            >
              {playing ? (
                <span className="play-orb__icon">❚❚</span>
              ) : (
                <span className="play-orb__icon">▶</span>
              )}
            </button>
            <p className="roulette__hint">
              Имя артиста скрыто — раскроется после мэтча
            </p>
          </div>
          <div className="roulette__actions">
            <button
              type="button"
              className="action-btn action-btn--skip"
              onClick={() => {
                stopAllAudio()
                skipTrack(progress)
              }}
            >
              скип
            </button>
            <button
              type="button"
              className="action-btn action-btn--like"
              onClick={() => {
                stopAllAudio()
                likeTrack(progress)
              }}
            >
              нравится
            </button>
            <button
              type="button"
              className="action-btn action-btn--block"
              title={user ? 'Не нравится артист' : 'Войдите, чтобы блокировать артистов'}
              aria-label="Не нравится артист"
              onClick={() => {
                stopAllAudio()
                blockArtist()
              }}
            >
              🚫
            </button>
            <button
              type="button"
              className="action-btn action-btn--report"
              title={user ? 'Пожаловаться на трек' : 'Войдите, чтобы пожаловаться'}
              aria-label="Пожаловаться"
              onClick={() => {
                if (!user) return
                setReportOpen(true)
              }}
            >
              ⚠️
            </button>
          </div>
        </section>
      )}

      {reportOpen && currentTrack && (
        <ReportModal
          track={currentTrack}
          onClose={() => setReportOpen(false)}
          onSubmit={async (reason) => submitReport(currentTrack, reason)}
        />
      )}

      {tab === 'scout' && listenerPhase === 'feedback' && currentTrack && (
        <section className="feedback-panel">
          <div className="feedback-panel__card">
            <h2>Быстрый фидбек</h2>
            {currentTrack.focusFeedback && (
              <p className="feedback-panel__focus">
                Фокус артиста: «{currentTrack.focusFeedback}»
              </p>
            )}
            <div className="emoji-row">
              {EMOJI_TAGS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`emoji-chip ${selectedEmojis.includes(e) ? 'is-on' : ''}`}
                  onClick={() => toggleEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
            <textarea
              className="input input--area"
              placeholder="Короткий комментарий…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={180}
            />
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => submitFeedback(selectedEmojis, comment, progress)}
            >
              Отправить и раскрыть карту
            </button>
          </div>
        </section>
      )}

      {tab === 'scout' && listenerPhase === 'reveal' && currentTrack && (
        <section className={`reveal ${revealBurst ? 'is-burst' : ''}`}>
          <div className="reveal__burst" aria-hidden />
          <div className="reveal__card">
            <img src={currentTrack.avatar} alt="" className="reveal__avatar" />
            <h2 className="reveal__name">{currentTrack.artistName}</h2>
            <p className="reveal__meta">
              {currentTrack.title} · {currentTrack.genre}
              {currentTrack.source === 'yandex' && (
                <> · {formatListeners(currentTrack.monthlyListeners)} слушателей / мес</>
              )}
              {currentTrack.source === 'soundlink' && <> · Локальное демо</>}
            </p>
            <div className="streaming-links">
              {SOCIAL_PLATFORMS.map(({ key, label }) => {
                const href = currentTrack.streaming[key]
                if (!href) return null
                return (
                  <a key={key} href={href} target="_blank" rel="noreferrer">
                    {label}
                  </a>
                )
              })}
            </div>
            <div className="reveal__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  addToFinds()
                  setTab('finds')
                }}
              >
                В мои находки
              </button>
              <button type="button" className="btn btn--ghost" onClick={nextTrack}>
                Дальше
              </button>
            </div>
            {currentTrack.openToCollab && (
              <div className="reveal__collab">
                <p>
                  {currentTrack.artistRole} · открыт к коллабам
                  {currentTrack.status ? ` · ${currentTrack.status}` : ''}
                </p>
                <button
                  type="button"
                  className="btn btn--neon"
                  onClick={() => {
                    proposeFit({
                      id: currentTrack.artistId,
                      name: currentTrack.artistName,
                    })
                    addToFinds()
                  }}
                >
                  Предложить фит
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'finds' && (
        <section className="finds">
          <header className="finds__head">
            <h2>Мои находки</h2>
            <p>Только твой плейлист — у других аккаунтов свой</p>
          </header>
          {discoveries.length === 0 ? (
            <p className="empty">Пока пусто — крути радар и сохраняй мэтчи.</p>
          ) : (
            <ul className="finds__list">
              {discoveries.map((d) => (
                <li key={d.id} className="finds__item">
                  <img src={d.avatar} alt="" />
                  <div className="finds__info">
                    <strong>{d.artistName}</strong>
                    <span>
                      {d.title} · {d.genre}
                    </span>
                    {d.feedback.emojis.length > 0 && (
                      <span className="finds__emojis">{d.feedback.emojis.join(' ')}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`play-mini ${findsPlaying === d.id ? 'is-on' : ''}`}
                    onClick={() =>
                      setFindsPlaying((id) => (id === d.id ? null : d.id))
                    }
                    aria-label="Play"
                  >
                    {findsPlaying === d.id ? '❚❚' : '▶'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {findsPlaying && (
            <div className="finds__now">
              <NeonWave
                seed={discoveries.find((d) => d.id === findsPlaying)?.waveSeed ?? 1}
                playing
                intensity={0.9}
              />
              <span>
                играет · {discoveries.find((d) => d.id === findsPlaying)?.artistName}
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
