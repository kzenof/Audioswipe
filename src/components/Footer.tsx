import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/rules">Правила площадки</Link>
      <span className="site-footer__dot">·</span>
      <span>Audioswipe © {new Date().getFullYear()}</span>
    </footer>
  )
}
