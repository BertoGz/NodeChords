import { useMemo } from 'react'
import { ROOT_NAMES } from '../theory/chords.js'
import { formatKey, scalePitchClasses } from '../theory/keys.js'
import { playNote } from '../audio/playChord.js'

/** One octave layout: white keys then black keys with left offsets. */
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

export default function KeyPiano({ homeKey, onClose }) {
  const scale = useMemo(() => {
    if (!homeKey) return { set: new Set(), degreeOf: new Map() }
    const pcs = scalePitchClasses(homeKey)
    const degreeOf = new Map()
    pcs.forEach((pc, i) => degreeOf.set(pc, i + 1))
    return { set: new Set(pcs), degreeOf, tonic: homeKey.tonic }
  }, [homeKey])

  if (!homeKey) return null

  const handlePlay = (pc) => {
    // Mid register: C4–B4
    playNote(60 + pc, 0.45)
  }

  return (
    <div className="key-piano" role="dialog" aria-label={`Scale notes for ${formatKey(homeKey)}`}>
      <div className="key-piano__head">
        <p className="key-piano__title">{formatKey(homeKey)}</p>
        <button type="button" className="key-piano__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className="key-piano__hint">Highlighted keys are in the scale. Click to hear.</p>
      <div className="key-piano__board" aria-hidden={false}>
        <div className="key-piano__whites">
          {WHITE.map((k) => {
            const inScale = scale.set.has(k.pc)
            const isTonic = k.pc === scale.tonic
            const degree = scale.degreeOf.get(k.pc)
            return (
              <button
                key={k.pc}
                type="button"
                className={[
                  'key-piano__key',
                  'key-piano__key--white',
                  inScale ? 'is-in-scale' : '',
                  isTonic ? 'is-tonic' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={inScale ? `${ROOT_NAMES[k.pc]} (degree ${degree})` : ROOT_NAMES[k.pc]}
                onClick={() => handlePlay(k.pc)}
              >
                <span className="key-piano__name">{ROOT_NAMES[k.pc]}</span>
                {inScale && <span className="key-piano__deg">{degree}</span>}
              </button>
            )
          })}
        </div>
        <div className="key-piano__blacks">
          {BLACK.map((k) => {
            const inScale = scale.set.has(k.pc)
            const isTonic = k.pc === scale.tonic
            const degree = scale.degreeOf.get(k.pc)
            return (
              <button
                key={k.pc}
                type="button"
                className={[
                  'key-piano__key',
                  'key-piano__key--black',
                  inScale ? 'is-in-scale' : '',
                  isTonic ? 'is-tonic' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `calc(${(k.afterWhite + 1) * (100 / 7)}% - 0.55rem)` }}
                title={inScale ? `${ROOT_NAMES[k.pc]} (degree ${degree})` : ROOT_NAMES[k.pc]}
                onClick={() => handlePlay(k.pc)}
              >
                {inScale && <span className="key-piano__deg">{degree}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <p className="key-piano__legend">
        <span className="key-piano__swatch key-piano__swatch--scale" /> in scale
        <span className="key-piano__swatch key-piano__swatch--tonic" /> tonic
      </p>
    </div>
  )
}
