export interface TrackReview {
  id: string
  trackId: string
  artistId: string
  fromUser: string
  emojis: string[]
  comment: string
  liked: boolean
  listenedToEnd: boolean
  progress: number
  timestamp: number
}

export interface ListenEvent {
  trackId: string
  artistId: string
  progress: number
  skipped: boolean
  timestamp: number
}

const REVIEWS_KEY = 'signal_reviews_v1'
const LISTENS_KEY = 'signal_listens_v1'

function norm(s: string) {
  return s.trim().toLowerCase()
}

function readReviews(): TrackReview[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TrackReview[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeReviews(list: TrackReview[]) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(list.slice(0, 500)))
}

function readListens(): ListenEvent[] {
  try {
    const raw = localStorage.getItem(LISTENS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ListenEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeListens(list: ListenEvent[]) {
  localStorage.setItem(LISTENS_KEY, JSON.stringify(list.slice(0, 2000)))
}

export function publishReview(
  review: Omit<TrackReview, 'id' | 'timestamp'> & { timestamp?: number },
) {
  const full: TrackReview = {
    ...review,
    id: `rv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: review.timestamp ?? Date.now(),
  }
  const all = readReviews()
  all.unshift(full)
  writeReviews(all)
  return full
}

export function recordListen(event: Omit<ListenEvent, 'timestamp'> & { timestamp?: number }) {
  const full: ListenEvent = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  }
  const all = readListens()
  all.unshift(full)
  writeListens(all)
  return full
}

export function getReviewsForTrack(trackId: string): TrackReview[] {
  return readReviews().filter((r) => r.trackId === trackId)
}

export function getReviewsForArtist(artistId: string): TrackReview[] {
  const key = norm(artistId)
  return readReviews().filter((r) => norm(r.artistId) === key)
}

/** Агрегация удержания: 10 точек 0–100% оставшихся слушателей */
export function buildSkipCurve(trackId: string): number[] {
  const events = readListens().filter((e) => e.trackId === trackId)
  if (events.length === 0) return []

  const buckets = 10
  const remaining = Array.from({ length: buckets }, () => events.length)

  for (const e of events) {
    const leaveAt = Math.min(
      buckets - 1,
      Math.floor(Math.max(0, Math.min(1, e.progress)) * buckets),
    )
    // если скипнули — ушли на leaveAt; если дослушали — остались до конца
    const dropFrom = e.skipped ? leaveAt : buckets
    for (let i = dropFrom; i < buckets; i++) {
      remaining[i] -= 1
    }
  }

  return remaining.map((n) =>
    Math.max(0, Math.round((n / events.length) * 100)),
  )
}
