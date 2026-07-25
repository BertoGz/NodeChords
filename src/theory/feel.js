import { isDominantQuality, isMajorish, isMinorish } from './chords.js'
import { isTonicOfKey } from './keys.js'

/** User-facing feel vocabulary for suggestions */
export const FEELS = {
  home: {
    id: 'home',
    label: 'Home',
    blurb: 'Settles toward the key center',
  },
  move: {
    id: 'move',
    label: 'Move',
    blurb: 'Keeps the progression going',
  },
  tighten: {
    id: 'tighten',
    label: 'Tighten',
    blurb: 'Adds pull and expectation',
  },
  color: {
    id: 'color',
    label: 'Color',
    blurb: 'Unexpected spice outside the safe path',
  },
}

/** Panel section order */
export const FEEL_GROUPS = [
  {
    id: 'safe',
    title: 'Safe next steps',
    hint: 'Stay grounded in the key',
    feels: ['home', 'move'],
  },
  {
    id: 'tension',
    title: 'Add tension',
    hint: 'Create pull toward a landing',
    feels: ['tighten'],
  },
  {
    id: 'spice',
    title: 'Spice',
    hint: 'Borrow color or surprise the ear',
    feels: ['color'],
  },
]

const PLAIN = {
  'secondary dominant': 'Adds strong pull toward another chord',
  'descending 5th': 'Classic forward motion',
  'ascending 5th': 'Lifts the harmony upward',
  stepwise: 'Smooth, stepwise root motion',
  mediant: 'Warm sideways shift',
  'chromatic color': 'Outside the key — spicy',
  'modal borrow': 'Borrowed color from a parallel mode',
  'tritone / chromatic color': 'Sharp tension, unexpected color',
  'ii → V motion': 'Sets up a dominant pull',
  'extension / recolor': 'Same root, richer color',
  'forward motion': 'Keeps energy moving',
  'stepwise climb': 'Climbs by step',
  'circle-of-fifths': 'Strong functional motion',
  'mediant color': 'Colorful sideways leap',
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
  'pivot (both keys)': 'Belongs to both keys — smooth bridge',
  'V7 of target': 'Dominant of the new key — strong pull',
  'V of target': 'Points at the new key',
  'ii of target': 'Sets up the new key’s dominant',
  'new tonic': 'Lands in the new key',
  'tritone sub → target': 'Jazzier pull into the new key',
  'in new key': 'Already speaks the destination key',
  bridge: 'Helps cross toward the new key',
}

function plainReason(reason, feelId) {
  if (!reason) return FEELS[feelId]?.blurb || ''
  const lower = reason.toLowerCase()
  for (const [key, text] of Object.entries(PLAIN)) {
    if (lower.includes(key.toLowerCase()) || reason.includes(key)) return text
  }
  // Degree labels like "ii · descending 5th"
  if (reason.includes('·')) {
    const parts = reason.split('·').map((s) => s.trim())
    const motion = parts[1]
    if (motion && PLAIN[motion]) return PLAIN[motion]
    if (motion?.includes('descending 5th')) return PLAIN['descending 5th']
    if (motion?.includes('ascending 5th')) return PLAIN['ascending 5th']
    if (motion?.includes('stepwise')) return PLAIN.stepwise
    if (motion?.includes('mediant')) return PLAIN.mediant
  }
  if (/^[ivx]+$/i.test(reason.trim()) || reason.includes('in key')) {
    return FEELS[feelId]?.blurb || 'In-key harmony'
  }
  return FEELS[feelId]?.blurb || reason
}

function tensionFor(feelId, score) {
  const base = { home: 1, move: 2, tighten: 4, color: 3 }[feelId] ?? 2
  if (score >= 70) return Math.min(5, base + 1)
  if (score <= 25) return Math.max(1, base - 1)
  return base
}

/**
 * Classify a scored suggestion into Home / Move / Tighten / Color.
 */
export function classifyFeel(entry, { homeKey = null, mode = 'build' } = {}) {
  const reason = (entry.reason || '').toLowerCase()
  const tag = (entry.tag || '').toLowerCase()
  const q = entry.chord?.quality
  const chord = entry.chord

  let feel = 'move'

  if (mode === 'modulate' || entry.mode === 'modulate') {
    if (tag === 'arrival' || reason.includes('tonic') || reason.includes('new tonic')) {
      feel = 'home'
    } else if (tag === 'dominant' || reason.includes('v7') || reason.includes('v of')) {
      feel = 'tighten'
    } else if (tag === 'pivot') {
      feel = 'move'
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
      feel = 'tighten'
    } else if (reason.includes('plagal') || reason.includes('iv →')) {
      feel = 'home'
    } else if (reason.includes('deceptive')) {
      feel = 'color'
    } else {
      feel = 'tighten'
    }
  } else {
    // Build / stay in key
    const isTonic = homeKey && chord && isTonicOfKey(chord, homeKey)
    if (isTonic) {
      feel = 'home'
    } else if (
      tag === 'color' ||
      reason.includes('chromatic') ||
      reason.includes('borrow') ||
      reason.includes('tritone') ||
      reason.includes('modal')
    ) {
      feel = 'color'
    } else if (
      isDominantQuality(q) ||
      reason.includes('secondary dominant') ||
      reason.includes('ii → v') ||
      reason.includes('dominant')
    ) {
      feel = 'tighten'
    } else if (
      // Dominant-function majors pointing up a 4th feel tense even without 7
      isMajorish(q) &&
      (reason.includes('ascending 5th') || reason.includes('descending 5th')) &&
      homeKey &&
      chord &&
      chord.root === (homeKey.tonic + 7) % 12
    ) {
      feel = 'tighten'
    } else if (isMinorish(q) && reason.includes('ii →')) {
      feel = 'tighten'
    } else {
      feel = 'move'
    }
  }

  const meta = FEELS[feel]
  return {
    feel,
    feelLabel: meta.label,
    blurb: plainReason(entry.reason, feel),
    tension: tensionFor(feel, entry.score || 0),
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
  const byFeel = { home: [], move: [], tighten: [], color: [] }
  for (const s of suggestions) {
    const id = byFeel[s.feel] ? s.feel : 'move'
    byFeel[id].push(s)
  }

  return FEEL_GROUPS.map((group) => ({
    ...group,
    items: group.feels.flatMap((f) => byFeel[f] || []),
  })).filter((g) => g.items.length > 0)
}
