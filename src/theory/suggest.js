import { allChords, chordId, formatChord } from './chords.js'
import { scoreBuild, scoreResolve } from './graph.js'
import {
  diatonicChords,
  formatKey,
  scaleDegreeOrdinal,
  scoreModulationBridge,
  secondaryDominantChords,
} from './keys.js'
import { enrichWithFeel } from './feel.js'

/**
 * Chord suggestions for the selected node.
 *
 * Stay-in-key: full key map labeled by harmonic function (Home / Departure / Tension),
 * plus secondary dominants. Resolve / modulate keep ranked bridge logic.
 *
 * @param {object} options
 * @param {object|null} options.fromChord
 * @param {'build'|'resolve'} options.mode
 * @param {object|null} options.targetChord
 * @param {object|null} options.homeKey
 * @param {object|null} options.modulateTo
 * @param {number} options.limit - caps resolve/modulate lists (ignored for stay-in-key map)
 */
export function suggest({
  fromChord = null,
  mode = 'build',
  targetChord = null,
  homeKey = null,
  modulateTo = null,
  modulateRole = null, // 'setup' | 'arrival' | null
  limit = 16,
} = {}) {
  const ctx = { homeKey, mode: modulateTo ? 'modulate' : mode }
  const degreeKey = modulateTo || homeKey

  let results
  if (mode === 'build' && modulateTo && modulateRole === 'arrival') {
    // Landing node: full destination key map (same as stay-in-key)
    results = enrichWithFeel(suggestKeyMap(modulateTo), {
      homeKey: modulateTo,
      mode: 'build',
    })
  } else if (mode === 'build' && modulateTo) {
    results = enrichWithFeel(
      suggestModulation(fromChord, homeKey, modulateTo, limit, modulateRole),
      { ...ctx, mode: 'modulate' },
    )
  } else if (mode === 'build' && homeKey) {
    results = enrichWithFeel(suggestKeyMap(homeKey), ctx)
  } else if (mode === 'resolve') {
    results = enrichWithFeel(suggestResolve(fromChord, targetChord, homeKey, limit), {
      ...ctx,
    })
  } else {
    results = enrichWithFeel(suggestLegacyBuild(fromChord, limit), ctx)
  }

  return attachScaleDegrees(results, degreeKey)
}

function attachScaleDegrees(results, key) {
  if (!key) return results
  return results.map((entry) => ({
    ...entry,
    scaleDegree: scaleDegreeOrdinal(entry.chord, key),
  }))
}

/**
 * Every chord in the key (triads, 7ths, 9ths, dims) labeled by job,
 * plus secondary dominants as tension levers.
 */
function suggestKeyMap(homeKey) {
  const results = []

  for (const entry of diatonicChords(homeKey)) {
    results.push({
      chord: entry.chord,
      symbol: entry.symbol,
      score: functionScore(entry.function),
      reason: entry.reason,
      mode: 'build',
      tag: 'diatonic',
      function: entry.function,
      degree: entry.degree,
    })
  }

  for (const entry of secondaryDominantChords(homeKey)) {
    results.push({
      chord: entry.chord,
      symbol: entry.symbol,
      score: 30,
      reason: entry.reason,
      mode: 'build',
      tag: 'secondary',
      function: 'color',
      degree: entry.degree,
    })
  }

  return results
}

function functionScore(fn) {
  return { home: 3, departure: 2, tension: 1, color: 0 }[fn] ?? 1
}

function suggestModulation(fromChord, fromKey, toKey, limit, modulateRole = null) {
  const results = []
  const catalog = allChords()

  const ensured = [
    ...diatonicChords(toKey).map((d) => d.chord),
    ...diatonicChords(fromKey || toKey).map((d) => d.chord),
    { root: (toKey.tonic + 7) % 12, quality: '7' },
    { root: (toKey.tonic + 7) % 12, quality: '9' },
    { root: (toKey.tonic + 2) % 12, quality: 'm7' },
    { root: (toKey.tonic + 1) % 12, quality: '7' },
  ]

  const seen = new Set()
  const pool = [...ensured, ...catalog]

  for (const candidate of pool) {
    const id = chordId(candidate)
    if (seen.has(id)) continue
    seen.add(id)
    if (fromChord && id === chordId(fromChord)) continue

    const { score, reason } = scoreModulationBridge(fromChord, candidate, fromKey, toKey)
    if (score <= 0) continue

    const tag = reason.startsWith('pivot')
      ? 'pivot'
      : reason.includes('V')
        ? 'dominant'
        : reason.includes('tonic')
          ? 'arrival'
          : 'bridge'

    if (modulateRole === 'arrival' && tag !== 'arrival') continue
    if (modulateRole === 'setup' && tag === 'arrival') continue

    let boosted = score
    if (modulateRole === 'setup') {
      if (tag === 'pivot' || tag === 'dominant') boosted += 16
      else if (tag === 'bridge') boosted += 6
    }

    results.push({
      chord: candidate,
      symbol: formatChord(candidate),
      score: Math.max(1, boosted),
      reason,
      mode: 'modulate',
      tag,
    })
  }

  results.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
  return results.slice(0, limit)
}

function suggestResolve(fromChord, targetChord, homeKey, limit) {
  const results = []
  const catalog = allChords()

  for (const candidate of catalog) {
    if (fromChord && chordId(candidate) === chordId(fromChord)) continue
    if (targetChord && chordId(candidate) === chordId(targetChord)) continue

    const { score, reason } = scoreResolve(fromChord, candidate, targetChord)
    if (score <= 0) continue

    let boosted = score
    let tag = 'cadence'
    if (homeKey) {
      const dia = diatonicChords(homeKey)
      if (dia.some((d) => chordId(d.chord) === chordId(candidate))) {
        boosted += 12
        tag = 'diatonic cadence'
      }
    }

    results.push({
      chord: candidate,
      symbol: formatChord(candidate),
      score: boosted,
      reason,
      mode: 'resolve',
      tag,
    })
  }

  results.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
  return results.slice(0, limit)
}

function suggestLegacyBuild(fromChord, limit) {
  const results = []
  for (const candidate of allChords()) {
    if (fromChord && chordId(candidate) === chordId(fromChord)) continue
    const { score, reason } = scoreBuild(fromChord, candidate)
    if (score <= 0) continue
    results.push({
      chord: candidate,
      symbol: formatChord(candidate),
      score,
      reason,
      mode: 'build',
      tag: 'legacy',
    })
  }
  results.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
  return results.slice(0, limit)
}

export function suggestionModeForNode(nodeId, edges, startNodeId) {
  if (!startNodeId || !nodeId) return 'build'
  const loopsToStart = edges.some((e) => e.source === nodeId && e.target === startNodeId)
  return loopsToStart ? 'resolve' : 'build'
}

export function previousChord(nodeId, nodes, edges) {
  const incoming = edges.find((e) => e.target === nodeId)
  if (!incoming) return null
  const prev = nodes.find((n) => n.id === incoming.source)
  return prev?.data?.chord ?? prev?.data?.previewChord ?? null
}

export function previousKey(nodeId, nodes, edges) {
  const incoming = edges.find((e) => e.target === nodeId)
  if (!incoming) return null
  const prev = nodes.find((n) => n.id === incoming.source)
  return prev?.data?.key ?? null
}

export function startChord(nodes) {
  const start = nodes.find((n) => n.data?.isStart)
  return start?.data?.chord ?? null
}

export function startKey(nodes) {
  const start = nodes.find((n) => n.data?.isStart)
  return start?.data?.key ?? null
}

export function startNodeId(nodes) {
  return nodes.find((n) => n.data?.isStart)?.id ?? null
}

export { formatKey, diatonicChords }
