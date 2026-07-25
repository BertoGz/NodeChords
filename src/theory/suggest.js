import { allChords, chordId, formatChord } from './chords.js'
import { scoreBuild, scoreResolve } from './graph.js'
import {
  diatonicChords,
  formatKey,
  scaleDegreeOrdinal,
  scoreDiatonicBuild,
  scoreModulationBridge,
} from './keys.js'
import { enrichWithFeel } from './feel.js'

/**
 * Ranked chord suggestions.
 *
 * @param {object} options
 * @param {object|null} options.fromChord
 * @param {'build'|'resolve'} options.mode - graph mode (loop resolve vs forward)
 * @param {object|null} options.targetChord - start chord for resolve
 * @param {object|null} options.homeKey - current key for this node
 * @param {object|null} options.modulateTo - when set, suggest bridges toward this key
 * @param {number} options.limit
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
  // Degree labels follow the key the suggestion is aiming at (target when modulating).
  const degreeKey = modulateTo || homeKey

  let results
  // Modulate: bridges toward target key
  if (mode === 'build' && modulateTo) {
    results = enrichWithFeel(
      suggestModulation(fromChord, homeKey, modulateTo, limit, modulateRole),
      { ...ctx, mode: 'modulate' },
    )
  } else if (mode === 'build' && homeKey) {
    // Stay in key: diatonic-first build
    results = enrichWithFeel(suggestDiatonic(fromChord, homeKey, limit), ctx)
  } else if (mode === 'resolve') {
    // Resolve to start (cadence), optionally biased by start key via homeKey
    results = enrichWithFeel(suggestResolve(fromChord, targetChord, homeKey, limit), {
      ...ctx,
      mode: 'resolve',
    })
  } else {
    // Fallback: legacy probabilistic build
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

function suggestDiatonic(fromChord, homeKey, limit) {
  const results = []
  const dia = diatonicChords(homeKey)

  // Always include every diatonic chord (triad + 7th flavors already in list)
  for (const entry of dia) {
    if (fromChord && chordId(entry.chord) === chordId(fromChord)) continue
    const { score, reason } = scoreDiatonicBuild(fromChord, entry.chord, homeKey)
    results.push({
      chord: entry.chord,
      symbol: entry.symbol,
      score,
      reason: reason || entry.degree,
      mode: 'build',
      tag: 'diatonic',
    })
  }

  // A few chromatic color options ranked below
  for (const candidate of allChords()) {
    if (results.some((r) => chordId(r.chord) === chordId(candidate))) continue
    if (fromChord && chordId(candidate) === chordId(fromChord)) continue
    const { score, reason } = scoreDiatonicBuild(fromChord, candidate, homeKey)
    if (score < 20) continue
    results.push({
      chord: candidate,
      symbol: formatChord(candidate),
      score: score * 0.55,
      reason,
      mode: 'build',
      tag: 'color',
    })
  }

  results.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
  return results.slice(0, limit)
}

function suggestModulation(fromChord, fromKey, toKey, limit, modulateRole = null) {
  const results = []
  const catalog = allChords()

  // Ensure destination diatonic set + common dominants are considered
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

    // Landing nodes: only new-tonic / arrival options
    if (modulateRole === 'arrival' && tag !== 'arrival') continue
    // Setup nodes: bridges only — no early landing on the new tonic
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
