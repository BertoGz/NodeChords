/** Default chord length: one bar in 4/4 */
export const DEFAULT_DURATION_BEATS = 4
export const DEFAULT_BPM = 90
export const BEATS_PER_BAR = 4
export const DEFAULT_MEASURE = 1

/**
 * Note types in beats (quarter note = 1).
 * Kept within one measure so notation stays bar-local.
 */
export const DURATION_OPTIONS = [
  { id: '8th', beats: 0.5, label: 'Eighth', symbol: '♪', short: '1/8' },
  { id: 'quarter', beats: 1, label: 'Quarter', symbol: '♩', short: '1/4' },
  { id: 'dotted-quarter', beats: 1.5, label: 'Dotted quarter', symbol: '♩.', short: '3/8' },
  { id: 'half', beats: 2, label: 'Half', symbol: '2♩', short: '1/2' },
  { id: 'dotted-half', beats: 3, label: 'Dotted half', symbol: '3♩', short: '3/4' },
  { id: 'whole', beats: 4, label: 'Whole', symbol: '𝅝', short: '1' },
]

export function normalizeDurationBeats(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DURATION_BEATS
  // Cap at one measure for notation-style editing
  const capped = Math.min(n, BEATS_PER_BAR)
  const match = DURATION_OPTIONS.find((o) => Math.abs(o.beats - capped) < 0.001)
  return match ? match.beats : Math.round(capped * 2) / 2
}

export function normalizeMeasure(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MEASURE
  return Math.max(1, Math.round(n))
}

export function durationOptionForBeats(beats) {
  const n = normalizeDurationBeats(beats)
  return (
    DURATION_OPTIONS.find((o) => Math.abs(o.beats - n) < 0.001) || {
      id: 'custom',
      beats: n,
      label: `${n} beat${n === 1 ? '' : 's'}`,
      symbol: String(n),
      short: String(n),
    }
  )
}

export function beatsToSeconds(beats, bpm = DEFAULT_BPM) {
  const safeBpm = Math.max(30, Math.min(300, Number(bpm) || DEFAULT_BPM))
  return (Math.max(0, Number(beats) || 0) * 60) / safeBpm
}

export function formatDurationLabel(beats) {
  return durationOptionForBeats(beats).label
}

export function formatDurationSymbol(beats) {
  return durationOptionForBeats(beats).symbol
}

export function clampBpm(bpm) {
  const n = Number(bpm)
  if (!Number.isFinite(n)) return DEFAULT_BPM
  return Math.max(40, Math.min(240, Math.round(n)))
}

/**
 * Infer measure numbers for older projects that only had durationBeats,
 * by packing chords into 4/4 bars in path order.
 */
export function inferMeasuresFromDurations(steps) {
  let measure = 1
  let used = 0
  return (steps || []).map((step) => {
    const beats = normalizeDurationBeats(step.durationBeats ?? DEFAULT_DURATION_BEATS)
    if (used > 0 && used + beats > BEATS_PER_BAR + 0.001) {
      measure += 1
      used = 0
    }
    const assigned = measure
    used += beats
    if (used >= BEATS_PER_BAR - 0.001) {
      measure += 1
      used = 0
    }
    return assigned
  })
}

/**
 * Suggest a measure for a new chord after `prev` given chords already in that measure (path order).
 */
export function suggestNextMeasure(prevMeasure, beatsUsedInPrev, nextBeats = DEFAULT_DURATION_BEATS) {
  const measure = normalizeMeasure(prevMeasure || 1)
  const used = Math.max(0, Number(beatsUsedInPrev) || 0)
  const beats = normalizeDurationBeats(nextBeats)
  if (used > 0 && used + beats > BEATS_PER_BAR + 0.001) {
    return measure + 1
  }
  if (used >= BEATS_PER_BAR - 0.001) return measure + 1
  return measure
}

/**
 * Lay out path steps into absolute beat positions using measure + note type.
 * Empty leftover beats in a measure become silence before the next measure.
 *
 * If a measure overflows (more note value than fits in 4/4), later chords in
 * that bar keep stacking in time, and the next measure starts after that stack
 * — never on top of it. That avoids double-triggers and dropped notes.
 *
 * @returns {Array<{ step, startBeat, durationBeats, measure, beatInBar, overflow }>}
 */
export function layoutStepsInMeasures(steps) {
  const list = (steps || []).map((step) => ({
    ...step,
    measure: normalizeMeasure(step.measure ?? DEFAULT_MEASURE),
    durationBeats: normalizeDurationBeats(step.durationBeats ?? DEFAULT_DURATION_BEATS),
  }))

  const maxMeasure = Math.max(DEFAULT_MEASURE, ...list.map((s) => s.measure), 1)
  const events = []
  let cursor = 0

  for (let m = 1; m <= maxMeasure; m++) {
    const inBar = list.filter((s) => s.measure === m)
    let beatInBar = 0
    const barStart = (m - 1) * BEATS_PER_BAR
    // Pad with silence up to this bar; never jump backward into an overflow.
    if (cursor < barStart) cursor = barStart
    for (const step of inBar) {
      events.push({
        step,
        id: step.id,
        chord: step.chord,
        voicing: step.voicing,
        measure: m,
        durationBeats: step.durationBeats,
        startBeat: cursor,
        beatInBar,
        overflow: beatInBar + step.durationBeats > BEATS_PER_BAR + 0.001,
      })
      beatInBar += step.durationBeats
      cursor += step.durationBeats
    }
  }

  return events
}

/** Total timeline length in beats (full bars covering every scheduled chord). */
export function timelineBeatsFromSteps(steps) {
  const list = steps || []
  if (!list.length) return BEATS_PER_BAR
  const layout = layoutStepsInMeasures(list)
  const layoutEnd = layout.reduce(
    (max, e) => Math.max(max, e.startBeat + e.durationBeats),
    0,
  )
  const measureEnd =
    Math.max(...list.map((s) => normalizeMeasure(s.measure ?? 1))) * BEATS_PER_BAR
  const end = Math.max(layoutEnd, measureEnd, BEATS_PER_BAR)
  return Math.ceil(end / BEATS_PER_BAR - 1e-9) * BEATS_PER_BAR
}

/** Beats already used in a measure by path steps (optional excludeId). */
export function beatsUsedInMeasure(steps, measure, excludeId = null) {
  const m = normalizeMeasure(measure)
  return (steps || [])
    .filter((s) => normalizeMeasure(s.measure ?? 1) === m && s.id !== excludeId)
    .reduce((sum, s) => sum + normalizeDurationBeats(s.durationBeats ?? DEFAULT_DURATION_BEATS), 0)
}
