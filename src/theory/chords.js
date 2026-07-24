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







export function chordMidiNotes(chord, balanced = true) {
  return balanced ? balancedMidiNotes(chord) : midiNotes(chord, 3)
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
