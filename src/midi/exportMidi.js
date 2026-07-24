import { chordMidiNotes, DEFAULT_VOICING, formatChord } from '../theory/chords.js'

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
 * Build a Type-0 Standard MIDI File from a chord progression.
 * Each chord is one quarter note (PPQ=480).
 * @param {Array<{chord: object, voicing?: string}|object>} steps
 */
export function buildMidiFile(steps, { bpm = 90 } = {}) {
  const PPQ = 480
  const events = []

  // Tempo meta (microseconds per quarter)
  const micros = Math.round(60_000_000 / bpm)
  events.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff],
  })
  // Time signature 4/4
  events.push({ tick: 0, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] })
  // Track name
  const name = 'NodeChords'
  events.push({ tick: 0, bytes: [0xff, 0x03, name.length, ...strBytes(name)] })
  // Program change — acoustic grand
  events.push({ tick: 0, bytes: [0xc0, 0] })

  let tick = 0
  const duration = PPQ // one quarter per chord

  for (const step of steps) {
    const chord = step?.chord ?? step
    if (!chord) continue
    const notes = chordMidiNotes(chord, step?.voicing || DEFAULT_VOICING)
    const label = formatChord(chord)
    // Optional text meta for DAW visibility
    const text = `Chord: ${label}`
    events.push({
      tick,
      bytes: [0xff, 0x01, text.length, ...strBytes(text)],
    })
    for (const note of notes) {
      events.push({ tick, bytes: [0x90, note, 90] })
    }
    const offTick = tick + duration
    for (const note of notes) {
      events.push({ tick: offTick, bytes: [0x80, note, 0] })
    }
    tick = offTick
  }

  events.push({ tick, bytes: [0xff, 0x2f, 0x00] }) // end of track

  // Sort by tick, stable for same-tick order (meta/notes already ordered)
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
    0, 0, 0, 6, // header length
    0, 0, // format 0
    0, 1, // one track
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

export function downloadMidi(steps, filename = 'chord-progression.mid') {
  if (!steps?.length) return false
  const data = buildMidiFile(steps)
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
