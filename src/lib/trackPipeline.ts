import type { Track } from '../types'

/** Минимум треков в буфере — ниже этого тихо подгружаем ещё */
export const MIN_BUFFER = 3

/** Сколько треков держим в памяти одновременно */
export const MAX_BUFFER = 5

/** Сколько треков запрашиваем за один фоновый fetch */
export const FETCH_BATCH = 5

/** Первая пачка при старте радара */
export const INITIAL_BATCH = 5

export function mergeIntoBuffer(queue: Track[], batch: Track[], seen: Set<string>): Track[] {
  const existing = new Set(queue.map((t) => t.id))
  const toAdd: Track[] = []
  for (const track of batch) {
    if (existing.has(track.id) || seen.has(track.id)) continue
    seen.add(track.id)
    toAdd.push(track)
  }
  return [...queue, ...toAdd].slice(0, MAX_BUFFER)
}

export function needsPrefetch(length: number) {
  return length > 0 && length < MIN_BUFFER
}
