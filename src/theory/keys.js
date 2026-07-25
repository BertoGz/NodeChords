import {
  ROOT_NAMES,
  chordId,
  formatChord,
  isDominantQuality,
  isMajorish,
  isMinorish,
  pitchClasses,
  rootInterval,
  sharedTones,
} from './chords.js'

/** Modes supported in v1 */
export const MODES = [
  { id: 'major', label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
]

/** Scale-degree triad/seventh qualities per mode (index 0 = tonic) */
const MODE_DEGREE_QUALITIES = {
  major: [
    ['maj', 'maj7'],
    ['min', 'm7'],
    ['min', 'm7'],
    ['maj', 'maj7'],
    ['maj', '7'],
    ['min', 'm7'],
    ['dim', 'm7b5'],
  ],
  minor: [
    ['min', 'm7'],
    ['dim', 'm7b5'],
    ['maj', 'maj7'],
    ['min', 'm7'],
    ['min', 'm7', '7'], // v often raised as V7
    ['maj', 'maj7'],
    ['maj', '7'],
  ],
  dorian: [
    ['min', 'm7'],
    ['min', 'm7'],
    ['maj', 'maj7'],
    ['maj', '7'],
    ['min', 'm7'],
    ['dim', 'm7b5'],
    ['maj', 'maj7'],
  ],
  mixolydian: [
    ['maj', '7'],
    ['min', 'm7'],
    ['dim', 'm7b5'],
    ['maj', 'maj7'],
    ['min', 'm7'],
    ['min', 'm7'],
    ['maj', 'maj7'],
  ],
}

const DEGREE_NAMES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii']
const DEGREE_NAMES_MINOR = ['i', 'ii', 'III', 'iv', 'v', 'VI', 'VII']

export function keyId(key) {
  if (!key) return ''
  return `${key.tonic}:${key.mode}`
}

export function formatKey(key) {
  if (!key) return ''
  const mode = MODES.find((m) => m.id === key.mode)
  return `${ROOT_NAMES[key.tonic]} ${mode?.label ?? key.mode}`
}

export function createKey(tonic, mode = 'major') {
  return { tonic: ((tonic % 12) + 12) % 12, mode }
}

const ORDINAL_SUFFIX = ['th', 'st', 'nd', 'rd']

/** 1 → "1st", 2 → "2nd", … 7 → "7th" */
export function formatOrdinal(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return ''
  const v = Math.round(num)
  const mod100 = v % 100
  const mod10 = v % 10
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : ORDINAL_SUFFIX[mod10] || 'th'
  return `${v}${suffix}`
}

/**
 * Scale-degree index (1–7) of a chord's root in key, or null if outside the scale.
 */
export function scaleDegreeNumber(chord, key) {
  if (!chord || !key) return null
  const pcs = scalePitchClasses(key)
  const idx = pcs.indexOf(((chord.root % 12) + 12) % 12)
  return idx >= 0 ? idx + 1 : null
}

/** "2nd", "5th", … or null when the root is not in the key's scale. */
export function scaleDegreeOrdinal(chord, key) {
  const n = scaleDegreeNumber(chord, key)
  return n ? formatOrdinal(n) : null
}

export function scalePitchClasses(key) {
  const mode = MODES.find((m) => m.id === key.mode) || MODES[0]
  return mode.intervals.map((i) => (key.tonic + i) % 12)
}

export function diatonicChords(key) {
  const mode = MODES.find((m) => m.id === key.mode) || MODES[0]
  const quals = MODE_DEGREE_QUALITIES[key.mode] || MODE_DEGREE_QUALITIES.major
  const names = key.mode === 'minor' ? DEGREE_NAMES_MINOR : DEGREE_NAMES
  const list = []
  const seen = new Set()

  mode.intervals.forEach((interval, degree) => {
    const root = (key.tonic + interval) % 12
    for (const quality of quals[degree]) {
      const chord = { root, quality }
      const id = chordId(chord)
      if (seen.has(id)) continue
      seen.add(id)
      list.push({
        chord,
        symbol: formatChord(chord),
        degree: names[degree],
        diatonic: true,
      })
    }
  })

  return list
}

/** Infer a starting key from a picked chord (maj-ish → major, min-ish → minor). */
export function inferKeyFromChord(chord) {
  if (!chord) return createKey(0, 'major')
  if (isMinorish(chord.quality) || chord.quality === 'm7b5') {
    return createKey(chord.root, 'minor')
  }
  if (chord.quality === '7' || chord.quality === '9') {
    return createKey(chord.root, 'mixolydian')
  }
  return createKey(chord.root, 'major')
}

/** Circle-of-fifths distance between two tonics (0–6). */
export function fifthsDistance(a, b) {
  const FIFTH = 7
  let steps = 0
  let pc = a
  while (pc !== b && steps < 12) {
    pc = (pc + FIFTH) % 12
    steps += 1
  }
  return Math.min(steps, 12 - steps)
}

/** Compare keys using tonic fifths distance (mode mismatch adds a little). */
export function keyDistance(fromKey, toKey) {
  if (!fromKey || !toKey) return 6
  if (keyId(fromKey) === keyId(toKey)) return 0
  let d = fifthsDistance(fromKey.tonic, toKey.tonic)
  // Relative major/minor (same pitch collection neighborhood)
  if (fromKey.mode === 'major' && toKey.mode === 'minor' && toKey.tonic === (fromKey.tonic + 9) % 12) {
    d = Math.min(d, 1)
  }
  if (fromKey.mode === 'minor' && toKey.mode === 'major' && toKey.tonic === (fromKey.tonic + 3) % 12) {
    d = Math.min(d, 1)
  }
  if (fromKey.mode !== toKey.mode) d = Math.min(6, d + 1)
  return d
}

export function distanceLabel(distance) {
  if (distance <= 1) return 'near'
  if (distance <= 3) return 'medium'
  return 'distant'
}

/** All keys for modulation picker, sorted by distance from home. */
export function modulationTargets(fromKey) {
  const targets = []
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of MODES) {
      const key = createKey(tonic, mode.id)
      if (fromKey && keyId(key) === keyId(fromKey)) continue
      const distance = keyDistance(fromKey, key)
      targets.push({
        key,
        label: formatKey(key),
        distance,
        distanceLabel: distanceLabel(distance),
      })
    }
  }
  targets.sort(
    (a, b) => a.distance - b.distance || a.label.localeCompare(b.label),
  )
  return targets
}

function chordInKey(chord, key) {
  return diatonicChords(key).some((d) => chordId(d.chord) === chordId(chord))
}

function isTonicOfKey(chord, key) {
  if (!chord || !key) return false
  if (chord.root !== key.tonic) return false
  if (key.mode === 'minor' || key.mode === 'dorian') return isMinorish(chord.quality)
  return isMajorish(chord.quality) || isDominantQuality(chord.quality)
}

/**
 * Score a candidate as a bridge from fromKey → toKey (optionally from previous chord).
 */
export function scoreModulationBridge(fromChord, candidate, fromKey, toKey) {
  if (!toKey || chordId(candidate) === (fromChord ? chordId(fromChord) : '')) {
    return { score: 0, reason: '' }
  }

  let score = 0
  let reason = 'bridge'

  const inFrom = fromKey ? chordInKey(candidate, fromKey) : false
  const inTo = chordInKey(candidate, toKey)
  const sharedWithFrom = fromChord ? sharedTones(fromChord, candidate) : 0
  const toTonic = { root: toKey.tonic, quality: toKey.mode === 'minor' || toKey.mode === 'dorian' ? 'min' : 'maj' }

  // Pivot: diatonic to both keys
  if (inFrom && inTo) {
    score += 70
    reason = 'pivot (both keys)'
  }

  // V7 (or V) of target
  const toTarget = rootInterval(candidate, toTonic)
  if (isDominantQuality(candidate.quality) && toTarget === 5) {
    score += 65
    reason = 'V7 of target'
  } else if (isMajorish(candidate.quality) && toTarget === 5) {
    score += 48
    reason = 'V of target'
  }

  // ii of target (minor → V prep)
  if (isMinorish(candidate.quality) && toTarget === 7) {
    score += 44
    reason = 'ii of target'
  }

  // Target tonic arrival
  if (isTonicOfKey(candidate, toKey)) {
    score += 50
    reason = 'new tonic'
  }

  // Tritone sub into target
  if (isDominantQuality(candidate.quality) && toTarget === 11) {
    score += 36
    reason = 'tritone sub → target'
  }

  // Diatonic only to destination (landing color)
  if (inTo && !inFrom) {
    score += 28
    if (reason === 'bridge') reason = 'in new key'
  }

  // Common tones with previous chord
  score += sharedWithFrom * 5

  // Soft preference for near-key motion from previous root
  if (fromChord) {
    const step = rootInterval(fromChord, candidate)
    if (step === 5 || step === 7 || step === 2 || step === 10) score += 6
  }

  // Distance penalty awareness is on the target picker; mild boost if already strong
  return { score: Math.max(0, score), reason }
}

/**
 * Build-mode score preferring diatonic motion inside homeKey.
 */
export function scoreDiatonicBuild(fromChord, candidate, homeKey) {
  if (!homeKey) return { score: 0, reason: '' }
  if (fromChord && chordId(fromChord) === chordId(candidate)) {
    return { score: 0, reason: '' }
  }

  const dia = diatonicChords(homeKey)
  const match = dia.find((d) => chordId(d.chord) === chordId(candidate))
  if (!match) {
    // Light chromatic color still allowed but ranked lower
    let score = 8
    let reason = 'chromatic color'
    if (fromChord) {
      score += sharedTones(fromChord, candidate) * 3
      const step = rootInterval(fromChord, candidate)
      if (isDominantQuality(candidate.quality) && step === 7) {
        score += 22
        reason = 'secondary dominant'
      }
    }
    return { score, reason }
  }

  let score = 40
  let reason = `${match.degree} in key`

  if (fromChord) {
    const step = rootInterval(fromChord, candidate)
    score += sharedTones(fromChord, candidate) * 4

    // Classic progressions inside key
    if (step === 5) {
      score += 18
      reason = `${match.degree} · descending 5th`
    } else if (step === 7) {
      score += 14
      reason = `${match.degree} · ascending 5th`
    } else if (step === 2 || step === 10) {
      score += 12
      reason = `${match.degree} · stepwise`
    } else if (step === 3 || step === 4 || step === 8 || step === 9) {
      score += 10
      reason = `${match.degree} · mediant`
    }

    // Prefer moving away from sitting on tonic repeats of same function
    if (candidate.root === homeKey.tonic && fromChord.root === homeKey.tonic) {
      score -= 15
    }
  } else {
    // No previous chord: tonic-first for start
    if (candidate.root === homeKey.tonic) score += 20
  }

  // Prefer seventh flavors slightly for jazzier build, but keep triads visible
  if (['maj7', 'm7', '7', 'm7b5'].includes(candidate.quality)) score += 4

  return { score: Math.max(0, score), reason }
}

export function pitchClassSetEqual(a, b) {
  const sa = pitchClasses(a).join(',')
  const sb = pitchClasses(b).join(',')
  return sa === sb
}

export { isTonicOfKey, chordInKey }
