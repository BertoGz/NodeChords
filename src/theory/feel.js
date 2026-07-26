import { isDominantQuality } from './chords.js'
import { functionBlurb, harmonicFunctionForChord } from './keys.js'

/** User-facing harmonic-function vocabulary */
export const FEELS = {
  home: {
    id: 'home',
    label: 'Home',
    blurb: 'Stable rest — feels like home in this key',
  },
  departure: {
    id: 'departure',
    label: 'Departure',
    blurb: 'Gentle motion away from home',
  },
  tension: {
    id: 'tension',
    label: 'Tension',
    blurb: 'Unstable pull that wants to resolve',
  },
  color: {
    id: 'color',
    label: 'Color',
    blurb: 'Outside the key — borrowed or secondary color',
  },
}

/** Panel section order — three jobs in the key, then spice */
export const FEEL_GROUPS = [
  {
    id: 'home',
    title: 'Home',
    hint: 'Stable / consonant — rest in the key',
    feels: ['home'],
  },
  {
    id: 'departure',
    title: 'Departure',
    hint: 'Mild motion — leave home without full pull',
    feels: ['departure'],
  },
  {
    id: 'tension',
    title: 'Tension',
    hint: 'Unstable / dissonant — craving resolution',
    feels: ['tension'],
  },
  {
    id: 'spice',
    title: 'Color',
    hint: 'Outside the key — secondary dominants and spice',
    feels: ['color'],
  },
]

const PLAIN = {
  'secondary dominant': 'Secondary dominant — pushes toward another chord in the key',
  'chromatic color': 'Outside the key — spicy',
  'modal borrow': 'Borrowed color from a parallel mode',
  'tritone / chromatic color': 'Sharp tension, unexpected color',
  'pivot (both keys)': 'Belongs to both keys — smooth bridge',
  'V7 of target': 'Dominant of the new key — strong pull',
  'V of target': 'Points at the new key',
  'ii of target': 'Sets up the new key’s dominant',
  'new tonic': 'Lands in the new key',
  'tritone sub → target': 'Jazzier pull into the new key',
  'in new key': 'Already speaks the destination key',
  bridge: 'Helps cross toward the new key',
  'V7 → I': 'Strong pull into home',
  'V → I': 'Classic dominant → home',
  'vii → I': 'Leading-tone pull into home',
  'ii → I': 'Soft approach to home',
  'IV → I (plagal)': 'Gentle “amen” landing feel',
  'sus dominant → I': 'Suspended dominant resolving home',
  'deceptive neighbor': 'Almost home — with a twist',
  'ii → V → I': 'Classic cadence setup',
  'tritone sub → I': 'Jazzier pull into home',
  'cadence approach': 'Helps close the loop',
}

function plainReason(reason, feelId) {
  if (!reason) return FEELS[feelId]?.blurb || ''
  // Prefer explicit key-map / degree role labels
  if (reason.includes('·') || reason.includes('—')) return reason
  const lower = reason.toLowerCase()
  for (const [key, text] of Object.entries(PLAIN)) {
    if (lower.includes(key.toLowerCase()) || reason.includes(key)) return text
  }
  if (/^[ivx]+$/i.test(reason.trim()) || reason.includes('in key')) {
    return FEELS[feelId]?.blurb || 'In-key harmony'
  }
  return FEELS[feelId]?.blurb || reason
}

function tensionFor(feelId) {
  return { home: 1, departure: 2, tension: 4, color: 3 }[feelId] ?? 2
}

/** Map legacy feel ids if anything still emits them */
function normalizeFeel(feel) {
  if (feel === 'move') return 'departure'
  if (feel === 'tighten') return 'tension'
  return feel
}

/**
 * Classify a suggestion into Home / Departure / Tension / Color.
 * Stay-in-key build prefers the chord's harmonic function in the key.
 */
export function classifyFeel(entry, { homeKey = null, mode = 'build' } = {}) {
  const reason = (entry.reason || '').toLowerCase()
  const tag = (entry.tag || '').toLowerCase()
  const q = entry.chord?.quality
  const chord = entry.chord

  // Prefer explicit function from the key palette
  if (entry.function && FEELS[entry.function]) {
    const feel = entry.function
    return {
      feel,
      feelLabel: FEELS[feel].label,
      blurb: plainReason(entry.reason, feel),
      tension: tensionFor(feel),
    }
  }

  let feel = 'departure'

  if (mode === 'modulate' || entry.mode === 'modulate') {
    if (tag === 'arrival' || reason.includes('tonic') || reason.includes('new tonic')) {
      feel = 'home'
    } else if (tag === 'dominant' || reason.includes('v7') || reason.includes('v of')) {
      feel = 'tension'
    } else if (tag === 'pivot') {
      feel = 'departure'
    } else {
      feel = 'color'
    }
  } else if (mode === 'resolve' || entry.mode === 'resolve') {
    if (
      reason.includes('v7') ||
      reason.includes('v →') ||
      reason.includes('vii') ||
      reason.includes('ii → v') ||
      reason.includes('sus dominant') ||
      reason.includes('tritone') ||
      isDominantQuality(q)
    ) {
      feel = 'tension'
    } else if (reason.includes('plagal') || reason.includes('iv →')) {
      feel = 'home'
    } else if (reason.includes('deceptive')) {
      feel = 'color'
    } else {
      feel = 'tension'
    }
  } else if (homeKey && chord) {
    const fn = harmonicFunctionForChord(chord, homeKey)
    if (fn === 'color' || fn === 'home' || fn === 'departure' || fn === 'tension') {
      feel = fn
    } else if (
      tag === 'color' ||
      reason.includes('chromatic') ||
      reason.includes('borrow') ||
      reason.includes('tritone') ||
      reason.includes('modal')
    ) {
      feel = 'color'
    } else if (reason.includes('secondary') || isDominantQuality(q)) {
      feel = 'tension'
    } else {
      feel = 'color'
    }
  } else if (
    tag === 'color' ||
    reason.includes('chromatic') ||
    reason.includes('borrow') ||
    reason.includes('tritone')
  ) {
    feel = 'color'
  } else if (isDominantQuality(q) || reason.includes('dominant')) {
    feel = 'tension'
  }

  feel = normalizeFeel(feel)
  const meta = FEELS[feel] || FEELS.departure
  return {
    feel,
    feelLabel: meta.label,
    blurb: plainReason(entry.reason, feel),
    tension: tensionFor(feel),
  }
}

/** Attach feel fields to suggestion results */
export function enrichWithFeel(results, ctx = {}) {
  return results.map((entry) => {
    const feel = classifyFeel(entry, ctx)
    return { ...entry, ...feel, tag: feel.feelLabel }
  })
}

/** Group suggestions for the side panel */
export function groupSuggestionsByFeel(suggestions) {
  const byFeel = { home: [], departure: [], tension: [], color: [] }
  for (const s of suggestions) {
    const feel = normalizeFeel(s.feel)
    const id = byFeel[feel] ? feel : 'departure'
    byFeel[id].push(s)
  }

  return FEEL_GROUPS.map((group) => ({
    ...group,
    items: group.feels.flatMap((f) => byFeel[f] || []),
  })).filter((g) => g.items.length > 0)
}

export { functionBlurb }
