interface Props {
  data: number[]
}

/** Simple SVG retention / skip curve */
export function RetentionChart({ data }: Props) {
  const w = 320
  const h = 120
  const pad = 8
  const max = 100
  const step = (w - pad * 2) / Math.max(data.length - 1, 1)

  const points = data
    .map((v, i) => {
      const x = pad + i * step
      const y = pad + (1 - v / max) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  const area = `${pad},${h - pad} ${points} ${pad + (data.length - 1) * step},${h - pad}`

  return (
    <div className="retention">
      <svg viewBox={`0 0 ${w} ${h}`} className="retention__svg" role="img" aria-label="График удержания">
        <defs>
          <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,255,200,0.35)" />
            <stop offset="100%" stopColor="rgba(0,255,200,0)" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#retFill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#00ffc8"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <div className="retention__axis">
        <span>0с</span>
        <span>скип</span>
        <span>конец</span>
      </div>
      <p className="retention__note">
        На какой секунде слушатели уходят — чем выше линия, тем больше осталось.
      </p>
    </div>
  )
}
