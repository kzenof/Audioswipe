import { useState } from 'react'
import { REPORT_REASONS, type Track } from '../types'

interface Props {
  track: Track
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}

export function ReportModal({ track, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      await onSubmit(reason)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal report-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="report-title"
      >
        <h2 id="report-title">Пожаловаться на трек</h2>
        <p className="modal__sub">
          Почему вы хотите пожаловаться на «{track.title}»?
        </p>

        <div className="report-reasons">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="report-reason">
              <input
                type="radio"
                name="report-reason"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {error && <p className="auth-error">{error}</p>}

        <div className="report-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={loading}
            onClick={() => void handleSubmit()}
          >
            {loading ? '…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  )
}
