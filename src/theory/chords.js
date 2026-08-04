/** Pitch-class roots: 0 = C … 11 = B */
export const ROOT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export const QUALITIES = [
  'maj',
  'min',
  'dim',
  'aug',
  'maj7',
  'm7',
  '7',
  'm7b5',
  'dim7',
  'sus2',
  'sus4',
  'add9',
  '9',
  'm9',
  'maj9',
]

/** Intervals from root (semitones) for each quality */
export const QUALITY_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
}

export const QUALITY_LABELS = {
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  maj7: 'maj7',
  m7: 'm7',
  '7': '7',
  m7b5: 'm7b5',
  dim7: 'dim7',
  sus2: 'sus2',
  sus4: 'sus4',
  add9: 'add9',
  '9': '9',
  m9: 'm9',
  maj9: 'maj9',
}

export function chordId(chord) {
  return `${chord.root}:${chord.quality}`
}

export function formatChord(chord) {
  if (!chord) return ''
  const root = ROOT_NAMES[chord.root]
  const q = QUALITY_LABELS[chord.quality] ?? chord.quality
  return `${root}${q}`
}

export function pitchClasses(chord) {
  const intervals = QUALITY_INTERVALS[chord.quality] || QUALITY_INTERVALS.maj
  return [...new Set(intervals.map((i) => (chord.root + i) % 12))].sort((a, b) => a - b)
}

export function midiNotes(chord, octave = 4) {
  const intervals = QUALITY_INTERVALS[chord.quality] || QUALITY_INTERVALS.maj
  const base = 12 * (octave + 1) + chord.root
  return intervals.map((i) => {
    let midi = base + i
    // Keep voicing roughly within two octaves starting at octave
    while (midi < base) midi += 12
    while (midi > base + 16) midi -= 12
    return midi
  })
}

/**
 * Register-normalized voicing for even brightness across roots/qualities.
 * - Bass: root in a low band (~G2–G3)
 * - Upper: other chord tones packed into C4–B4 (by pitch class)
 * The audible top of every chord stays in the same octave.
 */
export function balancedMidiNotes(chord) {
  const intervals = QUALITY_INTERVALS[chord.quality] || QUALITY_INTERVALS.maj
  const rootPc = chord.root % 12

  // Keep bass from climbing into the upper register (B/A roots especially)
  let bass = 48 + rootPc // C3–B3 seed
  if (bass > 55) bass -= 12 // A–B drop to A2–B2

  const pcs = [...new Set(intervals.map((i) => (rootPc + i) % 12))]
  const upper = pcs
    .filter((pc) => pc !== rootPc)
    .map((pc) => 60 + pc) // C4–B4
    .sort((a, b) => a - b)

  return [bass, ...upper]
}

export const VOICINGS = [
  { id: 'balanced', label: 'Balanced', hint: 'Even register, low root' },
  { id: 'close', label: 'Close', hint: 'Root position, tight stack' },
  { id: 'open', label: 'Open', hint: 'Drop-2, airier spacing' },
  { id: 'spread', label: 'Spread', hint: 'Wide, piano-style' },
  { id: 'shell', label: 'Shell', hint: 'Root + guide tones' },
  { id: 'inv1', label: '1st inversion', hint: '3rd in the bass' },
  { id: 'inv2', label: '2nd inversion', hint: '5th in the bass' },
]

export const DEFAULT_VOICING = 'balanced'

export const BASS_OCTAVES = [2, 3, 4, 5, 6]
export const DEFAULT_BASS_OCTAVE = null // "Auto" (keep current voicing algorithm)

function midiForC(octave) {
  // MIDI: C4 = 60 => 12 * (4 + 1)
  return 12 * (octave + 1)
}

function adjustToBassOctave(notes, bassOctave) {
  if (!Array.isArray(notes) || notes.length === 0) return notes
  if (bassOctave == null) return notes

  const notesMin = Math.min(...notes)
  const targetMin = midiForC(bassOctave)
  const targetMax = targetMin + 11
  const targetCenter = (targetMin + targetMax) / 2

  let best = null
  let bestCost = Infinity

  // Search a reasonable shift window (octaves) and pick the closest match.
  // This keeps the UI simple while being robust across chord types.
  for (let shiftOct = -8; shiftOct <= 8; shiftOct += 1) {
    const shiftedMin = notesMin + shiftOct * 12
    const inRange = shiftedMin >= targetMin && shiftedMin <= targetMax

    // Cost is distance-to-range, with a slight preference for being near the middle.
    const distToRange = shiftedMin < targetMin ? targetMin - shiftedMin : shiftedMin > targetMax ? shiftedMin - targetMax : 0
    const centerBias = Math.abs(shiftedMin - targetCenter)
    const cost = distToRange * 10 + centerBias

    if (cost < bestCost || (cost === bestCost && Math.abs(shiftOct) < Math.abs(best?.shiftOct ?? 0))) {
      best = { shiftOct, inRange }
      bestCost = cost
      // Early exit for perfect in-range center match.
      if (inRange && centerBias === 0) break
    }
  }

  if (!best) return notes
  const shift = best.shiftOct * 12
  return notes.map((n) => n + shift)
}

export function voicingLabel(id) {
  return VOICINGS.find((v) => v.id === id)?.label ?? 'Balanced'
}

/** Root-position stack starting near C4, one note per chord tone. */
function closeStack(chord) {
  const intervals = QUALITY_INTERVALS[chord.quality] || QUALITY_INTERVALS.maj
  const rootPc = chord.root % 12
  let root = 60 + rootPc
  if (root > 66) root -= 12 // keep the top of every chord in a similar band
  const notes = [...new Set(intervals)].sort((a, b) => a - b).map((i) => root + i)
  return notes
}

function invert(notes, times) {
  const out = [...notes]
  for (let i = 0; i < times && out.length > 1; i++) {
    out.push(out.shift() + 12)
  }
  return out
}

function dropTwo(notes) {
  if (notes.length < 3) return notes
  const sorted = [...notes].sort((a, b) => a - b)
  const secondFromTop = sorted.length - 2
  sorted[secondFromTop] -= 12
  return sorted.sort((a, b) => a - b)
}

function spreadVoicing(chord) {
  const notes = closeStack(chord)
  const bass = notes[0] - 12
  const upper = notes.slice(1).map((n, i) => (i % 2 === 1 ? n + 12 : n))
  return [bass, ...upper]
}

/** Root in the bass plus the tones that define the quality (3rd/7th). */
function shellVoicing(chord) {
  const intervals = QUALITY_INTERVALS[chord.quality] || QUALITY_INTERVALS.maj
  const rootPc = chord.root % 12
  const third = intervals.find((i) => [2, 3, 4, 5].includes(i))
  const seventh = intervals.find((i) => [9, 10, 11].includes(i))
  const guides = [third, seventh ?? 7].filter((i) => i !== undefined)
  return [36 + rootPc, ...guides.map((i) => 60 + ((rootPc + i) % 12))].sort((a, b) => a - b)
}

export function voicingMidiNotes(chord, voicing = DEFAULT_VOICING) {
  switch (voicing) {
    case 'close':
      return closeStack(chord)
    case 'open':
      return dropTwo(closeStack(chord))
    case 'spread':
      return spreadVoicing(chord)
    case 'shell':
      return shellVoicing(chord)
    case 'inv1':
      return invert(closeStack(chord), 1)
    case 'inv2':
      return invert(closeStack(chord), 2)
    case 'balanced':
    default:
      return balancedMidiNotes(chord)
  }
}




export function chordMidiNotes(
  chord,
  voicing = DEFAULT_VOICING,
  { bassOctave = DEFAULT_BASS_OCTAVE } = {},
) {
  const notes = voicingMidiNotes(chord, voicing)
  return adjustToBassOctave(notes, bassOctave)
}

export function allChords() {
  const list = []
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      list.push({ root, quality })
    }
  }
  return list
}

export function sharedTones(a, b) {
  const setB = new Set(pitchClasses(b))
  return pitchClasses(a).filter((pc) => setB.has(pc)).length
}

export function rootInterval(from, to) {
  return ((to.root - from.root) + 12) % 12
}

/** Rough chord-function family for scoring */
export function chordFamily(quality) {
  if (['maj', 'maj7', 'add9', 'maj9', 'sus2', 'sus4'].includes(quality)) return 'major'
  if (['min', 'm7', 'm9'].includes(quality)) return 'minor'
  if (['7', '9'].includes(quality)) return 'dominant'
  if (['dim', 'dim7', 'm7b5'].includes(quality)) return 'diminished'
  if (quality === 'aug') return 'augmented'
  return 'other'
}

export function isDominantQuality(quality) {
  return quality === '7' || quality === '9'
}

export function isMajorish(quality) {
  return ['maj', 'maj7', 'add9', 'maj9', 'sus2', 'sus4'].includes(quality)
}

export function isMinorish(quality) {
  return ['min', 'm7', 'm9'].includes(quality)
}
