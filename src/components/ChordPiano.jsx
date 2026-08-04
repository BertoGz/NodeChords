import { useMemo } from 'react'
import {
  ROOT_NAMES,
  formatChord,
  chordMidiNotes,
  voicingLabel,
  DEFAULT_VOICING,
} from '../theory/chords.js'
import { playNote, playChord } from '../audio/playChord.js'

const WHITE = [
  { pc: 0, label: 'C' },
  { pc: 2, label: 'D' },
  { pc: 4, label: 'E' },
  { pc: 5, label: 'F' },
  { pc: 7, label: 'G' },
  { pc: 9, label: 'A' },
  { pc: 11, label: 'B' },
]

const BLACK = [
  { pc: 1, label: 'C#', afterWhite: 0 },
  { pc: 3, label: 'Eb', afterWhite: 1 },
  { pc: 6, label: 'F#', afterWhite: 3 },
  { pc: 8, label: 'Ab', afterWhite: 4 },
  { pc: 10, label: 'Bb', afterWhite: 5 },
]

function midiOctave(midi) {
  return Math.floor(midi / 12) - 1
}

function midiLabel(midi) {
  return `${ROOT_NAMES[midi % 12]}${midiOctave(midi)}`
}

export default function ChordPiano({
  chord,
  voicing = DEFAULT_VOICING,
  bassOctave = null,
  onClose,
}) {
  const voiced = useMemo(() => {
    if (!chord) return { notes: [], set: new Set(), bass: null, octaves: [] }
    const notes = [...chordMidiNotes(chord, voicing, { bassOctave })].sort((a, b) => a - b)
    if (!notes.length) return { notes: [], set: new Set(), bass: null, octaves: [] }

    const lo = midiOctave(notes[0])
    const hi = midiOctave(notes[notes.length - 1])
    const start = Math.max(1, lo)
    const end = Math.max(start, Math.min(7, hi))
    const octaves = []
    for (let o = start; o <= end; o++) octaves.push(o)

    return {
      notes,
      set: new Set(notes),
      bass: notes[0],
      octaves,
    }
  }, [chord, voicing, bassOctave])

  if (!chord || !voiced.octaves.length) return null

  const whiteCount = voiced.octaves.length * 7
  const whitePct = 100 / whiteCount

  const handlePlayKey = (midi) => {
    playNote(midi, 0.45)
  }

  return (
    <div
      className="key-piano key-piano--chord"
      role="dialog"
      aria-label={`Voicing for ${formatChord(chord)}`}
      style={{ '--chord-octaves': voiced.octaves.length }}
    >
      <div className="key-piano__head">
        <p className="key-piano__title">
          {formatChord(chord)}
          <span className="key-piano__voicing"> · {voicingLabel(voicing)}</span>
        </p>
        <button type="button" className="key-piano__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="key-piano__hint">
        Highlighted keys are in this voicing
        {bassOctave != null ? ` (bass near C${bassOctave})` : ''}. Click a key or play all.
      </p>
      <div className="key-piano__board" aria-hidden={false}>
        <div
          className="key-piano__whites"
          style={{ gridTemplateColumns: `repeat(${whiteCount}, 1fr)` }}
        >
          {voiced.octaves.flatMap((oct) =>
            WHITE.map((k) => {
              const midi = 12 * (oct + 1) + k.pc
              const on = voiced.set.has(midi)
              const isBass = midi === voiced.bass
              return (
                <button
                  key={midi}
                  type="button"
                  className={[
                    'key-piano__key',
                    'key-piano__key--white',
                    on ? 'is-in-scale' : '',
                    isBass ? 'is-tonic' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={on ? `${midiLabel(midi)}${isBass ? ' (bass)' : ''}` : midiLabel(midi)}
                  onClick={() => handlePlayKey(midi)}
                >
                  <span className="key-piano__name">{ROOT_NAMES[k.pc]}</span>
                  {k.pc === 0 && <span className="key-piano__deg">{oct}</span>}
                </button>
              )
            }),
          )}
        </div>
        <div className="key-piano__blacks">
          {voiced.octaves.flatMap((oct, octIndex) =>
            BLACK.map((k) => {
              const midi = 12 * (oct + 1) + k.pc
              const on = voiced.set.has(midi)
              const isBass = midi === voiced.bass
              const whiteIndex = octIndex * 7 + k.afterWhite + 1
              return (
                <button
                  key={midi}
                  type="button"
                  className={[
                    'key-piano__key',
                    'key-piano__key--black',
                    on ? 'is-in-scale' : '',
                    isBass ? 'is-tonic' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `calc(${whiteIndex * whitePct}% - 0.55rem)`,
                  }}
                  title={on ? `${midiLabel(midi)}${isBass ? ' (bass)' : ''}` : midiLabel(midi)}
                  onClick={() => handlePlayKey(midi)}
                />
              )
            }),
          )}
        </div>
      </div>
      <div className="key-piano__footer">
        <p className="key-piano__legend">
          <span className="key-piano__swatch key-piano__swatch--scale" /> in voicing
          <span className="key-piano__swatch key-piano__swatch--tonic" /> bass
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={() => playChord(chord, { voicing, bassOctave })}
        >
          Play chord
        </button>
      </div>
    </div>
  )
}
