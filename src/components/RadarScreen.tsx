import { useApp } from '../context/AppContext'
import {
  GENRE_TAGS,
  POPULARITY_LABELS,
  type PopularityTier,
} from '../types'

/** Слева — digging, справа — стадионы, затем SoundLink */
const TIERS: PopularityTier[] = [
  'deep_underground',
  'freshmen',
  'indie',
  'popular',
  'hitmakers',
  'stadium',
  'local',
]

export function RadarScreen() {
  const {
    radar,
    setRadarPopularity,
    toggleRadarGenre,
    startScout,
    radarLoading,
  } = useApp()

  const tierIndex = Math.max(0, TIERS.indexOf(radar.popularity))
  const active = POPULARITY_LABELS[radar.popularity]

  return (
    <section className="radar">
      <header className="radar__head">
        <p className="radar__eyebrow">blind listen</p>
        <h2 className="radar__title">Настрой свой радар</h2>
        <p className="radar__sub">
          Выбери глубину и жанры — потом слушай вслепую.
        </p>
      </header>

      <div className="radar__block">
        <div className="radar__block-top">
          <h3>Глубина радара</h3>
          <span className="radar__range">{active.range}</span>
        </div>

        <div className="radar__tier-card">
          <strong>{active.title}</strong>
          <p>{active.hint}</p>
        </div>

        <label className="radar__slider-wrap">
          <input
            type="range"
            min={0}
            max={TIERS.length - 1}
            step={1}
            value={tierIndex}
            className="radar__slider"
            aria-label="Глубина радара"
            disabled={radarLoading}
            onChange={(e) => setRadarPopularity(TIERS[Number(e.target.value)])}
          />
          <div className="radar__ticks">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                className={radar.popularity === t ? 'is-on' : ''}
                disabled={radarLoading}
                onClick={() => setRadarPopularity(t)}
                title={POPULARITY_LABELS[t].range}
              >
                {POPULARITY_LABELS[t].short}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div className="radar__block">
        <h3>Жанры</h3>
        <p className="radar__hint">Пусто = все жанры.</p>
        <div className="radar__genres">
          {GENRE_TAGS.map((g) => (
            <button
              key={g}
              type="button"
              className={`chip ${radar.genres.includes(g) ? 'is-on' : ''}`}
              disabled={radarLoading}
              onClick={() => toggleRadarGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block radar__go"
        disabled={radarLoading}
        onClick={() => void startScout()}
      >
        {radarLoading ? 'Крутим радар…' : 'Запустить радар'}
      </button>
      {radarLoading && (
        <p className="radar__hint" style={{ marginTop: '0.75rem', textAlign: 'center' }}>
          Подбираем треки под твои настройки…
        </p>
      )}
    </section>
  )
}
