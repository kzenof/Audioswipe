import { useEffect, useRef } from 'react'

interface Props {
  seed?: number
  playing?: boolean
  intensity?: number
  className?: string
}

/** Canvas neon waveform — procedural, no real audio needed for demo */
export function NeonWave({
  seed = 1,
  playing = true,
  intensity = 1,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const parent = canvas.parentElement
      w = parent?.clientWidth || 600
      h = parent?.clientHeight || 200
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0
    const draw = () => {
      t += playing ? 0.045 : 0.008
      ctx.clearRect(0, 0, w, h)

      const layers = [
        { color: 'rgba(0, 255, 200, 0.9)', amp: 0.35, freq: 0.018, phase: seed },
        { color: 'rgba(255, 45, 120, 0.55)', amp: 0.28, freq: 0.027, phase: seed * 1.7 },
        { color: 'rgba(120, 180, 255, 0.4)', amp: 0.2, freq: 0.012, phase: seed * 0.4 },
      ]

      for (const layer of layers) {
        ctx.beginPath()
        ctx.strokeStyle = layer.color
        ctx.lineWidth = playing ? 2.2 : 1.4
        ctx.shadowBlur = playing ? 18 : 8
        ctx.shadowColor = layer.color

        const mid = h * 0.5
        const amp = h * layer.amp * intensity * (playing ? 1 : 0.25)

        for (let x = 0; x <= w; x += 2) {
          const n =
            Math.sin(x * layer.freq + t * 2.2 + layer.phase) *
              Math.sin(x * 0.008 + t + seed) +
            Math.sin(x * layer.freq * 2.4 - t * 1.5) * 0.35
          const y = mid + n * amp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // center glow pulse
      if (playing) {
        const pulse = 0.5 + Math.sin(t * 3) * 0.5
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.6)
        g.addColorStop(0, `rgba(0, 255, 200, ${0.08 * pulse})`)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }

      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [seed, playing, intensity])

  return <canvas ref={canvasRef} className={className} aria-hidden />
}
