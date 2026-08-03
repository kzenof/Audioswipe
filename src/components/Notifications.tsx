import { useState } from 'react'
import { useApp } from '../context/AppContext'

export function Notifications() {
  const { notifications, dismissNotification } = useApp()
  if (notifications.length === 0) return null

  return (
    <div className="toasts" aria-live="polite">
      {notifications.slice(0, 3).map((n, i) => (
        <div key={`${n}-${i}`} className="toast">
          <p>{n}</p>
          <button type="button" onClick={() => dismissNotification(i)} aria-label="Закрыть">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export function CollabChat() {
  const { chatOpen, chatPartner, chatMessages, closeChat, sendChat } = useApp()
  const [text, setText] = useState('')

  if (!chatOpen || !chatPartner) return null

  return (
    <div className="modal-backdrop" onClick={closeChat}>
      <div
        className="modal chat-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="chat-title"
      >
        <header className="chat-modal__head">
          <h2 id="chat-title">Фит · {chatPartner}</h2>
          <button type="button" className="modal__close" onClick={closeChat}>
            закрыть
          </button>
        </header>
        <p className="chat-modal__hint">Приватный чат для обмена демо</p>
        <ul className="chat-modal__msgs">
          {chatMessages.map((m) => (
            <li key={m.id} className={m.from === 'me' ? 'is-me' : 'is-them'}>
              <p>{m.text}</p>
              <time>{m.time}</time>
            </li>
          ))}
        </ul>
        <form
          className="chat-modal__form"
          onSubmit={(e) => {
            e.preventDefault()
            sendChat(text)
            setText('')
          }}
        >
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Кинь ссылку на демо…"
          />
          <button type="submit" className="btn btn--primary">
            →
          </button>
        </form>
      </div>
    </div>
  )
}
