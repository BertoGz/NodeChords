import { chordMidiNotes, DEFAULT_VOICING, formatChord } from '../theory/chords.js'
import {
  DEFAULT_BPM,
  clampBpm,
  layoutStepsInMeasures,
  timelineBeatsFromSteps,
} from '../theory/duration.js'

function writeVarLen(value) {
  const buffer = [value & 0x7f]
  value >>= 7
  while (value > 0) {
    buffer.push((value & 0x7f) | 0x80)
    value >>= 7
  }
  return buffer.reverse()
}

function strBytes(s) {
  return Array.from(s).map((c) => c.charCodeAt(0))
}

/**
 * Build a Type-0 Standard MIDI File from measure + note-type layout.
 * Empty leftover beats in a measure become rests (silence).
 */
export function buildMidiFile(steps, { bpm = DEFAULT_BPM } = {}) {
  const PPQ = 480
  const safeBpm = clampBpm(bpm)
  const events = []
  const layout = layoutStepsInMeasures(steps)

  const micros = Math.round(60_000_000 / safeBpm)
  events.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff],
  })
  events.push({ tick: 0, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] })
  const name = 'NodeChords'
  events.push({ tick: 0, bytes: [0xff, 0x03, name.length, ...strBytes(name)] })
  events.push({ tick: 0, bytes: [0xc0, 0] })

  for (const ev of layout) {
    const chord = ev.chord ?? ev.step?.chord
    if (!chord) continue
    const tick = Math.round(ev.startBeat * PPQ)
    const durationTicks = Math.max(1, Math.round(ev.durationBeats * PPQ))
    const notes = chordMidiNotes(
      chord,
      ev.voicing || ev.step?.voicing || DEFAULT_VOICING,
      { bassOctave: ev.bassOctave ?? ev.step?.bassOctave ?? null },
    )
    const label = formatChord(chord)
    const text = `Chord: ${label}`
    events.push({
      tick,
      bytes: [0xff, 0x01, text.length, ...strBytes(text)],
    })
    for (const note of notes) {
      events.push({ tick, bytes: [0x90, note, 90] })
    }
    const offTick = tick + durationTicks
    for (const note of notes) {
      events.push({ tick: offTick, bytes: [0x80, note, 0] })
    }
  }

  const endTick = Math.round(timelineBeatsFromSteps(steps) * PPQ)
  events.push({ tick: endTick, bytes: [0xff, 0x2f, 0x00] })
  events.sort((a, b) => a.tick - b.tick)

  const track = []
  let lastTick = 0
  for (const ev of events) {
    const delta = ev.tick - lastTick
    lastTick = ev.tick
    track.push(...writeVarLen(delta), ...ev.bytes)
  }

  const trackLen = track.length
  const header = [
    ...strBytes('MThd'),
    0, 0, 0, 6,
    0, 0,
    0, 1,
    (PPQ >> 8) & 0xff,
    PPQ & 0xff,
    ...strBytes('MTrk'),
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff,
  ]

  return new Uint8Array([...header, ...track])
}

export function downloadMidi(steps, filename = 'chord-progression.mid', { bpm = DEFAULT_BPM } = {}) {
  if (!steps?.length) return false
  const data = buildMidiFile(steps, { bpm })
  const blob = new Blob([data], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return true
}

export function midiFilenameFromChords(chords) {
  if (!chords?.length) return 'chord-progression.mid'
  const labels = chords.slice(0, 6).map((c) => formatChord(c).replace(/[^A-Za-z0-9#b]/g, ''))
  return `${labels.join('-') || 'progression'}.mid`
}
