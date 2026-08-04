import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p>Страница не найдена</p>
      <Link to="/" className="btn btn--primary">
        На главную
      </Link>
    </div>
  )
}
