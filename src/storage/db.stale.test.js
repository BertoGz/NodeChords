import { describe, expect, it } from 'vitest'
import {
  STALE_FILE_SAVE_MS,
  countStaleFileSaves,
  isFileSaveStale,
} from './db.js'

describe('isFileSaveStale', () => {
  const now = Date.UTC(2026, 6, 28)

  it('treats never-saved projects as stale', () => {
    expect(isFileSaveStale(null, now)).toBe(true)
    expect(isFileSaveStale(undefined, now)).toBe(true)
  })

  it('is fresh within 5 days', () => {
    expect(isFileSaveStale(now - STALE_FILE_SAVE_MS + 1, now)).toBe(false)
  })

  it('is stale after 5 days', () => {
    expect(isFileSaveStale(now - STALE_FILE_SAVE_MS - 1, now)).toBe(true)
  })
})

describe('countStaleFileSaves', () => {
  const now = Date.UTC(2026, 6, 28)

  it('counts projects without a recent file save', () => {
    const projects = [
      { lastFileSaveAt: null },
      { lastFileSaveAt: now },
      { lastFileSaveAt: now - STALE_FILE_SAVE_MS - 1000 },
    ]
    expect(countStaleFileSaves(projects, now)).toBe(2)
  })
})
