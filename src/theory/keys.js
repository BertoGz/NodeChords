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

/**
 * Scale-degree qualities per mode (index 0 = tonic).
 * Triads + 7ths + 9ths + dims so the key map stays rich without leaving the palette.
 */
const MODE_DEGREE_QUALITIES = {
  major: [
    ['maj', 'maj7', 'maj9', 'add9'],
    ['min', 'm7', 'm9'],
    ['min', 'm7', 'm9'],
    ['maj', 'maj7', 'maj9', 'add9'],
    ['maj', '7', '9'],
    ['min', 'm7', 'm9'],
    ['dim', 'm7b5', 'dim7'],
  ],
  minor: [
    ['min', 'm7', 'm9'],
    ['dim', 'm7b5', 'dim7'],
    ['maj', 'maj7', 'maj9', 'add9'],
    ['min', 'm7', 'm9'],
    ['min', 'm7', '7', '9'], // v / raised V7–V9
    ['maj', 'maj7', 'maj9', 'add9'],
    ['maj', '7', '9'],
  ],
  dorian: [
    ['min', 'm7', 'm9'],
    ['min', 'm7', 'm9'],
    ['maj', 'maj7', 'maj9', 'add9'],
    ['maj', '7', '9'],
    ['min', 'm7', 'm9'],
    ['dim', 'm7b5', 'dim7'],
    ['maj', 'maj7', 'maj9'],
  ],
  mixolydian: [
    ['maj', '7', '9'],
    ['min', 'm7', 'm9'],
    ['dim', 'm7b5', 'dim7'],
    ['maj', 'maj7', 'maj9', 'add9'],
    ['min', 'm7', 'm9'],
    ['min', 'm7', 'm9'],
    ['maj', 'maj7', 'maj9'],
  ],
}

const DEGREE_NAMES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']
const DEGREE_NAMES_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']
const DEGREE_NAMES_DORIAN = ['i', 'ii', 'III', 'IV', 'v', 'vi°', 'VII']
const DEGREE_NAMES_MIXOLYDIAN = ['I', 'ii', 'iii°', 'IV', 'v', 'vi', 'VII']

/**
 * Default harmonic function by scale-degree index (0–6).
 *
 * Rules used across modes:
 * - Tonic family → home
 * - Perfect-5th degree with a *minor* triad (no leading tone) → home (stable pillar)
 * - Perfect-5th degree with a *major* / dominant triad (leading tone present) → tension
 * - Subdominant area (ii / IV / iv / VI in aeolian) → departure
 * - Diminished chords and ♭VII modal dominants → tension
 */
const DEGREE_FUNCTIONS = {
  // I iii vi home · ii IV departure · V vii° tension (leading tone)
  major: ['home', 'departure', 'home', 'departure', 'tension', 'home', 'tension'],
  // i III home · iv VI departure · v home (minor, no LT) · ii° + VII tension
  minor: ['home', 'tension', 'home', 'departure', 'home', 'departure', 'tension'],
  // i III home · ii IV departure · v home · vi° + VII tension
  dorian: ['home', 'departure', 'home', 'departure', 'home', 'tension', 'tension'],
  // I + v home · ii IV vi departure · iii° + VII tension
  mixolydian: ['home', 'departure', 'tension', 'departure', 'home', 'departure', 'tension'],
}

function degreeNamesForMode(modeId) {
  if (modeId === 'minor') return DEGREE_NAMES_MINOR
  if (modeId === 'dorian') return DEGREE_NAMES_DORIAN
  if (modeId === 'mixolydian') return DEGREE_NAMES_MIXOLYDIAN
  return DEGREE_NAMES
}

const FUNCTION_BLURBS = {
  home: 'Stable rest — feels like home in this key',
  departure: 'Gentle motion away from home',
  tension: 'Unstable pull that wants to resolve',
  color: 'Outside the key — borrowed or secondary color',
}

const QUALITY_SORT = {
  maj: 0,
  min: 0,
  dim: 0,
  aug: 0,
  maj7: 1,
  m7: 1,
  '7': 1,
  m7b5: 1,
  dim7: 2,
  maj9: 3,
  m9: 3,
  '9': 3,
  add9: 4,
  sus2: 5,
  sus4: 5,
}

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

/** Harmonic function for a scale-degree index in this mode (degree default). */
export function harmonicFunctionForDegree(degreeIndex, modeId = 'major') {
  const table = DEGREE_FUNCTIONS[modeId] || DEGREE_FUNCTIONS.major
  return table[degreeIndex] || 'departure'
}

/**
 * Function for a specific chord in key — degree default plus quality overrides.
 * Raised V7/V9 in minor (or any dominant-quality chord on the 5th) reads as tension.
 * Diminished sonorities always read as tension.
 */
export function harmonicFunctionForChord(chord, key) {
  if (!chord || !key) return 'departure'
  const degreeIndex = scaleDegreeNumber(chord, key)
  if (degreeIndex == null) return 'color'
  const idx = degreeIndex - 1
  let fn = harmonicFunctionForDegree(idx, key.mode)
  const q = chord.quality

  // Fully / half diminished → tension
  if (q === 'dim' || q === 'dim7' || q === 'm7b5') return 'tension'

  // Dominant 7/9 on the 5th degree = real dominant pull (e.g. raised V in minor)
  if (idx === 4 && isDominantQuality(q)) return 'tension'

  // Major triad/7th on the 5th in a mode whose default v is minor → borrowed major V
  if (
    idx === 4 &&
    (key.mode === 'minor' || key.mode === 'dorian' || key.mode === 'mixolydian') &&
    (q === 'maj' || q === 'maj7' || q === 'maj9' || q === 'add9')
  ) {
    return 'tension'
  }

  return fn
}

export function functionBlurb(fn) {
  return FUNCTION_BLURBS[fn] || FUNCTION_BLURBS.departure
}

/**
 * Plain-language role for a degree (section already names Home/Departure/Tension).
 */
export function degreeRoleLabel(degreeName, fn, { degreeIndex = null, quality = null } = {}) {
  if (!degreeName) return functionBlurb(fn)
  if (fn === 'home') {
    if (degreeIndex === 0) return `${degreeName} — tonic rest`
    if (degreeIndex === 4) return `${degreeName} — stable 5th`
    return `${degreeName} — tonic family`
  }
  if (fn === 'departure') return `${degreeName} — gentle motion`
  if (fn === 'tension') {
    if (degreeIndex === 4 && isDominantQuality(quality)) {
      return `${degreeName} — dominant pull`
    }
    if (degreeIndex === 6) return `${degreeName} — modal dominant`
    if (quality === 'dim' || quality === 'dim7' || quality === 'm7b5') {
      return `${degreeName} — diminished pull`
    }
    return `${degreeName} — wants resolution`
  }
  return `${degreeName} — outside color`
}

export function diatonicChords(key) {
  const mode = MODES.find((m) => m.id === key.mode) || MODES[0]
  const quals = MODE_DEGREE_QUALITIES[key.mode] || MODE_DEGREE_QUALITIES.major
  const names = degreeNamesForMode(key.mode)
  const list = []
  const seen = new Set()

  mode.intervals.forEach((interval, degree) => {
    const root = (key.tonic + interval) % 12
    for (const quality of quals[degree]) {
      const chord = { root, quality }
      const id = chordId(chord)
      if (seen.has(id)) continue
      seen.add(id)
      const fn = harmonicFunctionForChord(chord, key)
      list.push({
        chord,
        symbol: formatChord(chord),
        degree: names[degree],
        degreeIndex: degree,
        function: fn,
        reason: degreeRoleLabel(names[degree], fn, { degreeIndex: degree, quality }),
        diatonic: true,
      })
    }
  })

  list.sort(
    (a, b) =>
      a.degreeIndex - b.degreeIndex ||
      (QUALITY_SORT[a.chord.quality] ?? 9) - (QUALITY_SORT[b.chord.quality] ?? 9),
  )

  return list
}

/**
 * Secondary dominants (V/x) toward non-tonic diatonic roots — 7ths & 9ths included.
 * These are chromatic levers that push toward a chord in the key.
 */
export function secondaryDominantChords(key) {
  if (!key) return []
  const mode = MODES.find((m) => m.id === key.mode) || MODES[0]
  const names = degreeNamesForMode(key.mode)
  const diatonicIds = new Set(diatonicChords(key).map((d) => chordId(d.chord)))
  const list = []
  const seen = new Set()

  mode.intervals.forEach((interval, degree) => {
    if (degree === 0) return // not V/I as "secondary"
    const targetRoot = (key.tonic + interval) % 12
    const targetDegree = names[degree]
    const secondaryRoot = (targetRoot + 7) % 12
    for (const quality of ['7', '9']) {
      const chord = { root: secondaryRoot, quality }
      const id = chordId(chord)
      if (seen.has(id) || diatonicIds.has(id)) continue
      seen.add(id)
      list.push({
        chord,
        symbol: formatChord(chord),
        degree: `V/${targetDegree}`,
        degreeIndex: degree,
        function: 'color',
        reason: `V/${targetDegree} · secondary dominant → ${ROOT_NAMES[targetRoot]}`,
        diatonic: false,
        secondary: true,
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

/** Semitone distance between tonics (0–6). */
export function chromaticTonicDistance(a, b) {
  const diff = Math.abs((((a - b) % 12) + 12) % 12)
  return Math.min(diff, 12 - diff)
}

/** Compare keys using circle-of-fifths, with same-mode stepwise tonic shifts treated as close. */
export function keyDistance(fromKey, toKey) {
  if (!fromKey || !toKey) return 6
  if (keyId(fromKey) === keyId(toKey)) return 0

  let d = fifthsDistance(fromKey.tonic, toKey.tonic)

  // A Mixolydian → B Mixolydian → C Mixolydian are equal semitone steps;
  // fifths alone ranks B→C much farther than A→B. Same-mode chromatic
  // neighbors should stay easy to reach in the picker.
  if (fromKey.mode === toKey.mode) {
    d = Math.min(d, chromaticTonicDistance(fromKey.tonic, toKey.tonic))
  }

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
