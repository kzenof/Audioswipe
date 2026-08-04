import { useNavigate } from 'react-router-dom'

interface Props {
  /** '/' — на главную, 'back' — history.back() */
  to?: '/' | 'back'
  label?: string
}

export function BackButton({ to = '/', label = '← Назад' }: Props) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => (to === 'back' ? navigate(-1) : navigate(to))}
    >
      {label}
    </button>
  )
}
