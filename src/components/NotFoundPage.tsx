import { Link } from 'react-router-dom'
import { BackButton } from './BackButton'

export function NotFoundPage() {
  return (
    <div className="not-found">
      <BackButton />
      <h1>404</h1>
      <p>Страница не найдена</p>
      <Link to="/" className="btn btn--primary">
        На главную
      </Link>
    </div>
  )
}
