/** Процедурный WAV для демо-каталога «Яндекс Музыка» — без внешних файлов */

const cache = new Map<string, string>()

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i], -1, 1)
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Короткий «битовый» луп по seed — чтобы в радаре Яндекса реально играло */
export function getSynthAudioUrl(trackId: string, seed: number, durationSec: number): string {
  const key = `${trackId}:${seed}:${durationSec}`
  const hit = cache.get(key)
  if (hit) return hit

  const sampleRate = 22050
  const seconds = clamp(durationSec, 8, 48)
  const total = Math.floor(sampleRate * seconds)
  const samples = new Float32Array(total)

  const root = 110 + (seed % 12) * 8
  const bpm = 85 + (seed % 7) * 8
  const beat = sampleRate * (60 / bpm)
  const thirds = [1, 5 / 4, 3 / 2, 2]

  for (let i = 0; i < total; i++) {
    const t = i / sampleRate
    const beatPos = (i % beat) / beat
    const bar = Math.floor(i / beat) % 4

    // kick
    const kickEnv = Math.exp(-beatPos * 18) * (bar % 2 === 0 || beatPos < 0.08 ? 1 : 0.15)
    const kick = Math.sin(2 * Math.PI * (55 + beatPos * 40) * t) * kickEnv * 0.55

    // hat
    const hat =
      (Math.random() * 2 - 1) *
      Math.exp(-((beatPos * 8) % 1) * 20) *
      (beatPos > 0.45 && beatPos < 0.55 ? 0.12 : 0.04)

    // bass + lead
    const deg = thirds[(Math.floor(t * 2) + seed) % thirds.length]
    const freq = root * deg
    const bass = Math.sin(2 * Math.PI * (freq / 2) * t) * 0.22
    const lead =
      Math.sin(2 * Math.PI * freq * t) * 0.12 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.04 * Math.sin(t * 3 + seed)

    const ambience = Math.sin(2 * Math.PI * (freq / 4) * t) * 0.06
    const fade =
      t < 0.04 ? t / 0.04 : t > seconds - 0.2 ? (seconds - t) / 0.2 : 1

    samples[i] = (kick + hat + bass + lead + ambience) * fade * 0.85
  }

  const url = URL.createObjectURL(encodeWav(samples, sampleRate))
  cache.set(key, url)
  return url
}
