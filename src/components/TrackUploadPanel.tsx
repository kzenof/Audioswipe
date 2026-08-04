import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { probeAudioDuration } from '../lib/feed'
import type { GenreTag } from '../types'
import { DEFAULT_PREVIEW_DURATION_SEC, GENRE_TAGS } from '../types'

const FOCUS_OPTIONS = [
  'Оцените сведение',
  'Как вам припев?',
  'Бас достаточно плотный?',
  'Энергия куплета ок?',
  'Как вам атмосфера?',
]

const PREVIEW_LENGTHS = [15, 30, 45] as const

export interface UploadTrackInput {
  title: string
  genreTag: GenreTag
  previewStartSec: number
  previewDurationSec: number
}

interface Props {
  canUpload: boolean
  focusFeedback: string
  onFocusFeedbackChange: (v: string) => void
  onPublish: (file: File, input: UploadTrackInput) => void | Promise<void>
}

function formatSec(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TrackUploadPanel({
  canUpload,
  focusFeedback,
  onFocusFeedbackChange,
  onPublish,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [genreTag, setGenreTag] = useState<GenreTag>('Рэп')
  const [duration, setDuration] = useState(0)
  const [previewStart, setPreviewStart] = useState(0)
  const [previewLen, setPreviewLen] = useState(DEFAULT_PREVIEW_DURATION_SEC)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const maxStart = Math.max(0, duration - previewLen)

  useEffect(() => {
    if (previewStart > maxStart) setPreviewStart(maxStart)
  }, [previewStart, maxStart])

  const reset = () => {
    setFile(null)
    setTitle('')
    setDuration(0)
    setPreviewStart(0)
    setPreviewLen(DEFAULT_PREVIEW_DURATION_SEC)
    setError(null)
  }

  const pickFile = useCallback(async (next: File) => {
    if (!next.type.startsWith('audio/')) {
      setError('Нужен аудиофайл (mp3, wav, ogg…)')
      return
    }
    setError(null)
    setFile(next)
    setTitle(next.name.replace(/\.[^.]+$/, ''))
    const d = await probeAudioDuration(next)
    setDuration(d)
    const clip = Math.min(DEFAULT_PREVIEW_DURATION_SEC, d)
    setPreviewLen(clip)
    setPreviewStart(0)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!canUpload) return
    const f = e.dataTransfer.files?.[0]
    if (f) void pickFile(f)
  }

  const seekPreview = (start: number) => {
    setPreviewStart(start)
    const audio = audioRef.current
    if (audio) audio.currentTime = start
  }

  const playPreview = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = previewStart
    void audio.play()
  }

  const handlePublish = async () => {
    if (!file || !canUpload) return
    if (!title.trim()) {
      setError('Укажи название трека')
      return
    }
    setUploading(true)
    setError(null)
    try {
      await onPublish(file, {
        title: title.trim(),
        genreTag,
        previewStartSec: previewStart,
        previewDurationSec: previewLen,
      })
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="studio__upload">
      <h2>Студия</h2>
      <p>Загружай демо — другие слушатели услышат выбранный фрагмент в радаре «Локальные».</p>

      {!canUpload && (
        <p className="studio__blocked">
          Вы заблокированы за нарушение правил. Загрузка новых треков недоступна.
        </p>
      )}

      {!file ? (
        <label
          className={`upload-zone ${!canUpload ? 'is-disabled' : ''} ${dragOver ? 'is-dragover' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            if (canUpload) setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            accept="audio/*"
            hidden
            disabled={!canUpload}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickFile(f)
              e.target.value = ''
            }}
          />
          <span className="upload-zone__plus">+</span>
          <span>{canUpload ? 'Перетащи трек или кликни' : 'Загрузка заблокирована'}</span>
        </label>
      ) : (
        <div className="upload-form">
          <label className="field">
            <span>Название</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название трека"
            />
          </label>

          <label className="field">
            <span>Жанр для радара</span>
            <select
              className="input"
              value={genreTag}
              onChange={(e) => setGenreTag(e.target.value as GenreTag)}
            >
              {GENRE_TAGS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>
              Фрагмент для ленты · {formatSec(previewStart)} —{' '}
              {formatSec(Math.min(duration, previewStart + previewLen))}
            </span>
            <div className="preview-picker">
              {previewUrl && (
                <audio
                  ref={audioRef}
                  src={previewUrl}
                  preload="metadata"
                  onTimeUpdate={() => {
                    const audio = audioRef.current
                    if (!audio) return
                    if (audio.currentTime >= previewStart + previewLen) {
                      audio.pause()
                      audio.currentTime = previewStart
                    }
                  }}
                />
              )}
              <input
                type="range"
                className="preview-picker__range"
                min={0}
                max={maxStart}
                step={1}
                value={previewStart}
                disabled={duration <= previewLen}
                onChange={(e) => seekPreview(Number(e.target.value))}
              />
              <div className="preview-picker__meta">
                <span>Начало: {formatSec(previewStart)}</span>
                <span>Длина трека: {formatSec(duration)}</span>
              </div>
              <div className="chip-row">
                {PREVIEW_LENGTHS.map((len) => (
                  <button
                    key={len}
                    type="button"
                    className={`chip ${previewLen === len ? 'is-on' : ''}`}
                    onClick={() => setPreviewLen(Math.min(len, duration))}
                  >
                    {len} сек
                  </button>
                ))}
                <button type="button" className="btn btn--ghost btn--sm" onClick={playPreview}>
                  ▶ Прослушать фрагмент
                </button>
              </div>
            </div>
          </div>

          <div className="upload-form__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={uploading || !canUpload}
              onClick={() => void handlePublish()}
            >
              {uploading ? 'Публикуем…' : 'Опубликовать в ленту'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset} disabled={uploading}>
              Отмена
            </button>
          </div>
        </div>
      )}

      <label className="field">
        <span>Фокус фидбека</span>
        <select
          className="input"
          value={focusFeedback}
          onChange={(e) => onFocusFeedbackChange(e.target.value)}
        >
          {FOCUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="studio__blocked">{error}</p>}
    </div>
  )
}
