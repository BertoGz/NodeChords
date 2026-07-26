import { Midi } from '@tonejs/midi'

import {
  DEFAULT_VOICING,
  QUALITY_LABELS,
  QUALITIES,
  ROOT_NAMES,
  allChords,
  chordId,
  pitchClasses,
} from '../theory/chords.js'
import { createKey, inferKeyFromChord } from '../theory/keys.js'
import {
  BEATS_PER_BAR,
  DEFAULT_BPM,
  clampBpm,
  normalizeDurationBeats,
} from '../theory/duration.js'

const EPS = 1e-4
const GRID = 0.5 // snap onsets/durations to eighth notes
const ONSET_GROUP_BEATS = 0.25 // merge near-simultaneous onsets into one hit

function quantize(beats) {
  return Math.round((Number(beats) || 0) / GRID) * GRID
}

/** Reverse of `formatChord`: "Am7" -> { root, quality }. */
export function parseChordLabel(label) {
  if (!label) return null
  const text = String(label).trim()
  if (!text) return null

  // Longest root spelling first so "C#" wins over "C".
  const roots = ROOT_NAMES.map((name, root) => ({ name, root })).sort(
    (a, b) => b.name.length - a.name.length,
  )
  const match = roots.find((r) => text.startsWith(r.name))
  if (!match) return null

  const suffix = text.slice(match.name.length)
  const quality = Object.keys(QUALITY_LABELS).find(
    (q) => QUALITY_LABELS[q] === suffix,
  )
  if (!quality) return null
  return { root: match.root, quality }
}

/** Best-effort chord identity from a set of sounding pitch classes. */
export function detectChord(pitchClassSet, bassPc = null) {
  const present = new Set(pitchClassSet)
  if (present.size < 2) return null

  let best = null
  let bestScore = -Infinity

  for (const candidate of allChords()) {
    const tones = pitchClasses(candidate)
    const toneSet = new Set(tones)
    let matched = 0
    for (const pc of tones) if (present.has(pc)) matched += 1
    const missing = tones.length - matched
    let extra = 0
    for (const pc of present) if (!toneSet.has(pc)) extra += 1

    let score = matched * 3 - missing * 2 - extra * 2
    // Favor candidates whose size is close to what is actually sounding.
    score -= Math.abs(tones.length - present.size) * 0.5
    if (present.has(candidate.root)) score += 1
    if (bassPc != null && candidate.root === bassPc) score += 2

    const simpler = QUALITIES.indexOf(candidate.quality)
    if (
      score > bestScore ||
      (score === bestScore &&
        best &&
        simpler < QUALITIES.indexOf(best.quality))
    ) {
      best = candidate
      bestScore = score
    }
  }

  // Require at least two real chord tones to avoid labeling stray dyads.
  if (!best || bestScore < 2) return null
  return best
}

/** Collect pitched (non-percussion) notes as { midi, startBeat, endBeat }. */
function collectNotes(midi) {
  const ppq = midi.header.ppq || 480
  const notes = []
  for (const track of midi.tracks) {
    if (track.instrument?.percussion) continue
    if (track.channel === 9) continue
    for (const note of track.notes) {
      const startBeat = note.ticks / ppq
      const endBeat = (note.ticks + note.durationTicks) / ppq
      if (endBeat - startBeat <= EPS) continue
      notes.push({ midi: note.midi, startBeat, endBeat })
    }
  }
  notes.sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi)
  return notes
}

/** Group notes into harmonic "hits" by near-simultaneous onset. */
function buildHits(notes) {
  const hits = []
  for (const note of notes) {
    const onset = quantize(note.startBeat)
    const last = hits[hits.length - 1]
    if (last && onset - last.onset <= ONSET_GROUP_BEATS + EPS) {
      last.notes.push(note)
    } else {
      hits.push({ onset, notes: [note] })
    }
  }
  return hits
}

/** Chord regions inferred from note content: [{ chord, startBeat, endBeat }]. */
function regionsFromNotes(notes) {
  const hits = buildHits(notes)
  const raw = []

  for (const hit of hits) {
    // Include notes still sounding from earlier hits (sustained pads / legato).
    const sounding = [...hit.notes]
    for (const note of notes) {
      if (
        note.startBeat < hit.onset - EPS &&
        note.endBeat > hit.onset + EPS &&
        !sounding.includes(note)
      ) {
        sounding.push(note)
      }
    }

    const pcs = new Set(sounding.map((n) => ((n.midi % 12) + 12) % 12))
    const bassPc = ((Math.min(...sounding.map((n) => n.midi)) % 12) + 12) % 12
    const chord = detectChord(pcs, bassPc)
    if (!chord) continue

    const endBeat = Math.max(...hit.notes.map((n) => n.endBeat))
    raw.push({ chord, startBeat: hit.onset, endBeat })
  }

  return mergeRegions(raw)
}

/** Chord regions from embedded "Chord:" markers (exact NodeChords round-trip). */
function regionsFromLabels(midi, notes) {
  const ppq = midi.header.ppq || 480
  const labels = (midi.header.meta || [])
    .filter((m) => typeof m.text === 'string' && m.text.startsWith('Chord:'))
    .map((m) => ({
      beat: quantize(m.ticks / ppq),
      chord: parseChordLabel(m.text.slice('Chord:'.length).trim()),
    }))
    .filter((l) => l.chord)
    .sort((a, b) => a.beat - b.beat)

  if (!labels.length) return null

  const raw = labels.map((label, i) => {
    const next = labels[i + 1]
    const onsetNotes = notes.filter(
      (n) => Math.abs(n.startBeat - label.beat) <= GRID / 2 + EPS,
    )
    const noteEnd = onsetNotes.length
      ? Math.max(...onsetNotes.map((n) => n.endBeat))
      : label.beat + BEATS_PER_BAR
    const endBeat = next ? Math.min(noteEnd, next.beat) : noteEnd
    return { chord: label.chord, startBeat: label.beat, endBeat }
  })

  return mergeRegions(raw)
}

/** Collapse consecutive identical chords and clamp overlaps. */
function mergeRegions(regions) {
  const sorted = [...regions].sort((a, b) => a.startBeat - b.startBeat)
  const merged = []
  for (const region of sorted) {
    if (region.endBeat - region.startBeat <= EPS) continue
    const last = merged[merged.length - 1]
    if (
      last &&
      chordId(last.chord) === chordId(region.chord) &&
      region.startBeat - last.endBeat <= EPS
    ) {
      last.endBeat = Math.max(last.endBeat, region.endBeat)
    } else {
      if (last && region.startBeat < last.endBeat) last.endBeat = region.startBeat
      merged.push({ ...region })
    }
  }
  return merged.filter((r) => r.endBeat - r.startBeat > EPS)
}

/** Split a held chord across 4/4 bars into per-measure steps. */
function regionToSteps(region) {
  const steps = []
  const total = quantize(region.endBeat - region.startBeat)
  if (total < GRID - EPS) return steps

  let remaining = total
  let measureIndex = Math.floor((region.startBeat + EPS) / BEATS_PER_BAR)
  let offset = quantize(region.startBeat - measureIndex * BEATS_PER_BAR)
  if (offset >= BEATS_PER_BAR - EPS) {
    offset = 0
    measureIndex += 1
  }

  let measure = measureIndex + 1
  while (remaining >= GRID - EPS) {
    const space = BEATS_PER_BAR - offset
    const take = quantize(Math.min(remaining, space))
    if (take < GRID - EPS) break
    steps.push({
      chord: region.chord,
      measure,
      durationBeats: normalizeDurationBeats(take),
    })
    remaining -= take
    measure += 1
    offset = 0
  }

  return steps
}

/** Build a loadable project (linear graph) from chord steps. */
function buildProject(steps, { bpm }) {
  const firstChord = steps[0]?.chord ?? null
  const draftKey = firstChord ? inferKeyFromChord(firstChord) : createKey(0, 'major')

  const nodes = steps.map((step, i) => ({
    id: `n${i + 1}`,
    type: 'chord',
    position: {
      x: 280 + i * 220,
      y: 220 + (i % 2 === 0 ? 40 : -40),
    },
    data: {
      chord: step.chord,
      key: draftKey,
      intent: 'stay',
      modulateTo: null,
      modulateFromKey: null,
      modulateRole: null,
      voicing: DEFAULT_VOICING,
      durationBeats: step.durationBeats,
      measure: step.measure,
      isStart: i === 0,
      mode: null,
      targetSymbol: '',
    },
  }))

  const edges = []
  for (let i = 1; i < nodes.length; i++) {
    edges.push({
      id: `e-n${i}-n${i + 1}`,
      source: `n${i}`,
      target: `n${i + 1}`,
    })
  }

  return {
    nodes,
    edges,
    draftKey,
    selectedNodeId: nodes[0]?.id ?? null,
    idCounter: nodes.length,
    bpm: clampBpm(bpm),
    metronomeEnabled: true,
  }
}

/**
 * Parse a Standard MIDI file (Type 0/1) into a loadable NodeChords project.
 * Prefers embedded "Chord:" markers (exact round-trip), otherwise detects
 * chords from note content. Throws if no chords can be recovered.
 *
 * @param {ArrayBuffer|Uint8Array} data
 * @returns {{ project: object, chordCount: number }}
 */
export function parseMidiToProject(data) {
  let midi
  try {
    midi = new Midi(data)
  } catch {
    throw new Error('That file is not a valid MIDI file.')
  }

  const notes = collectNotes(midi)
  if (!notes.length) {
    throw new Error('No pitched notes found in that MIDI file.')
  }

  const bpm = midi.header.tempos?.[0]?.bpm ?? DEFAULT_BPM
  const regions = regionsFromLabels(midi, notes) ?? regionsFromNotes(notes)
  const steps = regions.flatMap(regionToSteps)

  if (!steps.length) {
    throw new Error('Could not detect any chords in that MIDI file.')
  }

  return {
    project: buildProject(steps, { bpm }),
    chordCount: regions.length,
  }
}

export function readMidiFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(parseMidiToProject(reader.result))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsArrayBuffer(file)
  })
}
