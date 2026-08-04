import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatChord,
  chordId,
  DEFAULT_VOICING,
  VOICINGS,
  BASS_OCTAVES,
  DEFAULT_BASS_OCTAVE,
  voicingLabel,
} from '../theory/chords.js'
import { formatKey } from '../theory/keys.js'
import { groupSuggestionsByFeel } from '../theory/feel.js'
import { playChord } from '../audio/playChord.js'
import KeyPiano from './KeyPiano.jsx'
import ChordPiano from './ChordPiano.jsx'

function TensionMeter({ value = 1 }) {
  const n = Math.max(1, Math.min(5, value || 1))
  return (
    <span className="suggestion__tension" title={`Tension ${n} of 5`} aria-label={`Tension ${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`suggestion__dot ${i < n ? 'is-on' : ''}`} />
      ))}
    </span>
  )
}

function SuggestionRow({ s, active, voicing, bassOctave, onAssign }) {
  return (
    <li>
      <button
        type="button"
        className={`suggestion suggestion--${s.feel || 'departure'} ${active ? 'is-active' : ''}`}
        onClick={() => {
          playChord(s.chord, { voicing, bassOctave })
          onAssign(s.chord)
        }}
      >
        <span className="suggestion__headline">
          <span className="suggestion__symbol">{s.symbol}</span>
          {s.scaleDegree && (
            <span className="suggestion__degree" title={`${s.scaleDegree} of the key`}>
              {s.scaleDegree}
            </span>
          )}
        </span>
        <span className="suggestion__reason">{s.blurb || s.reason}</span>
        <TensionMeter value={s.tension} />
      </button>
    </li>
  )
}

export default function SuggestionPanel({
  selectedNode,
  mode,
  suggestions,
  targetChord,
  homeKey,
  intent,
  modulateTo,
  modulateRole,
  voicing = DEFAULT_VOICING,
  bassOctave = DEFAULT_BASS_OCTAVE,
  onAssign,
  onOpenModulate,
  onVoicingChange,
  onBassOctaveChange,
}) {
  const [voicingOpen, setVoicingOpen] = useState(false)
  const [bassOpen, setBassOpen] = useState(false)
  const [pianoOpen, setPianoOpen] = useState(false)
  const [chordPianoOpen, setChordPianoOpen] = useState(false)
  const voicingRef = useRef(null)
  const bassRef = useRef(null)
  const pianoRef = useRef(null)
  const chordPianoRef = useRef(null)

  useEffect(() => {
    if (!voicingOpen) return
    const onPointer = (e) => {
      if (!voicingRef.current?.contains(e.target)) setVoicingOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setVoicingOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [voicingOpen])

  useEffect(() => {
    if (!bassOpen) return
    const onPointer = (e) => {
      if (!bassRef.current?.contains(e.target)) setBassOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setBassOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [bassOpen])

  useEffect(() => {
    if (!pianoOpen) return
    const onPointer = (e) => {
      if (!pianoRef.current?.contains(e.target)) setPianoOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setPianoOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [pianoOpen])

  useEffect(() => {
    if (!chordPianoOpen) return
    const onPointer = (e) => {
      if (!chordPianoRef.current?.contains(e.target)) setChordPianoOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setChordPianoOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [chordPianoOpen])

  useEffect(() => {
    setVoicingOpen(false)
    setBassOpen(false)
    setPianoOpen(false)
    setChordPianoOpen(false)
  }, [selectedNode?.id])

  const groups = useMemo(() => groupSuggestionsByFeel(suggestions), [suggestions])

  if (!selectedNode) {
    return (
      <aside className="panel">
        <h2 className="panel__title">Chords in key</h2>
        <p className="panel__empty">Select a node to see every chord for its key.</p>
      </aside>
    )
  }

  const chord = selectedNode.data?.chord
  const isModulating = intent === 'modulate' && Boolean(modulateTo)

  let title = 'Chords in this key'
  if (mode === 'resolve') title = 'How do you want to land?'
  else if (isModulating) {
    title =
      modulateRole === 'arrival'
        ? `Chords in ${formatKey(modulateTo)}`
        : 'Bridge toward the new key'
  }

  return (
    <aside className="panel">
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {homeKey && (
          <p className="panel__meta panel__meta--key">
            <span>
              Current Key: <strong>{formatKey(homeKey)}</strong>
            </span>
            <span className="key-piano-wrap" ref={pianoRef}>
              <button
                type="button"
                className={`btn-piano ${pianoOpen ? 'is-open' : ''}`}
                aria-expanded={pianoOpen}
                aria-haspopup="dialog"
                title={`Show ${formatKey(homeKey)} on piano`}
                onClick={() => {
                  setChordPianoOpen(false)
                  setPianoOpen((open) => !open)
                }}
              >
                ♩
              </button>
              {pianoOpen && (
                <KeyPiano homeKey={homeKey} onClose={() => setPianoOpen(false)} />
              )}
            </span>
            {mode === 'build' && (
              <button
                type="button"
                className={`btn btn--ghost btn--compact ${isModulating ? 'is-active' : ''}`}
                title={
                  isModulating
                    ? `Change modulation toward ${formatKey(modulateTo)}`
                    : 'Modulate to a different key'
                }
                onClick={() => onOpenModulate?.()}
              >
                {isModulating ? 'Change key…' : 'Modulate…'}
              </button>
            )}
          </p>
        )}
        {mode === 'resolve' && targetChord && (
          <p className="panel__meta">
            Closing the loop to <strong>{formatChord(targetChord)}</strong>
          </p>
        )}
        {isModulating && (
          <p className="panel__meta">
            {modulateRole === 'arrival'
              ? `Landed in ${formatKey(modulateTo)} — pick any chord in the new key`
              : `Setup toward ${formatKey(modulateTo)} — bridges that pull or pivot`}
            {chord ? ' — pick another to swap' : ''}
          </p>
        )}
        {chord && (
          <p className="panel__meta panel__meta--key">
            <span>
              Current Chord: <strong>{formatChord(chord)}</strong>
            </span>
            <span className="key-piano-wrap" ref={chordPianoRef}>
              <button
                type="button"
                className={`btn-piano ${chordPianoOpen ? 'is-open' : ''}`}
                aria-expanded={chordPianoOpen}
                aria-haspopup="dialog"
                title={`Show ${formatChord(chord)} voicing on piano`}
                onClick={() => {
                  setPianoOpen(false)
                  setChordPianoOpen((open) => !open)
                }}
              >
                ♩
              </button>
              {chordPianoOpen && (
                <ChordPiano
                  chord={chord}
                  voicing={voicing}
                  bassOctave={bassOctave}
                  onClose={() => setChordPianoOpen(false)}
                />
              )}
            </span>
          </p>
        )}
      </header>

      {chord && (
        <div className="panel__actions">
          <div className="panel__actions-row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => playChord(chord, { voicing, bassOctave })}
            >
              Play chord
            </button>
            <div className="voicing-menu" ref={voicingRef}>
              <button
                type="button"
                className="btn btn--ghost"
                aria-haspopup="menu"
                aria-expanded={voicingOpen}
                title="Change how this chord is voiced"
                onClick={() => {
                  setBassOpen(false)
                  setVoicingOpen((open) => !open)
                }}
              >
                {voicingLabel(voicing)} ▾
              </button>
              {voicingOpen && (
                <div className="voicing-menu__dropdown" role="menu">
                  <p className="voicing-menu__title">Voicing for this node</p>
                  {VOICINGS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={v.id === voicing}
                      className={`voicing-menu__item ${v.id === voicing ? 'is-active' : ''}`}
                      onClick={() => {
                        onVoicingChange?.(v.id)
                        playChord(chord, { voicing: v.id, bassOctave })
                        setVoicingOpen(false)
                      }}
                    >
                      <span className="voicing-menu__label">{v.label}</span>
                      <span className="voicing-menu__hint">{v.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel__actions-row">
            <div className="voicing-menu" ref={bassRef}>
              <button
                type="button"
                className="btn btn--ghost"
                aria-haspopup="menu"
                aria-expanded={bassOpen}
                title="Where to place the chord’s lowest note"
                onClick={() => {
                  setVoicingOpen(false)
                  setBassOpen((open) => !open)
                }}
              >
                {bassOctave == null ? 'Bass Note' : `C${bassOctave}`} ▾
              </button>
              {bassOpen && (
                <div className="voicing-menu__dropdown" role="menu">
                  <p className="voicing-menu__title">Bass for this node</p>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={bassOctave == null}
                    className={`voicing-menu__item ${bassOctave == null ? 'is-active' : ''}`}
                    onClick={() => {
                      onBassOctaveChange?.(null)
                      playChord(chord, { voicing, bassOctave: null })
                      setBassOpen(false)
                    }}
                  >
                    <span className="voicing-menu__label">Default</span>
                    <span className="voicing-menu__hint">Follow the voicing’s natural register</span>
                  </button>
                  {BASS_OCTAVES.map((o) => (
                    <button
                      key={o}
                      type="button"
                      role="menuitemradio"
                      aria-checked={bassOctave === o}
                      className={`voicing-menu__item ${bassOctave === o ? 'is-active' : ''}`}
                      onClick={() => {
                        onBassOctaveChange?.(o)
                        playChord(chord, { voicing, bassOctave: o })
                        setBassOpen(false)
                      }}
                    >
                      <span className="voicing-menu__label">C{o}</span>
                      <span className="voicing-menu__hint">Lowest note near C{o}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="suggestions">
        {suggestions.length === 0 && (
          <p className="suggestions__empty">
            {mode === 'resolve'
              ? 'Landing chords will appear here, or pick from the palette.'
              : isModulating
                ? 'Bridge chords toward the target will appear here.'
                : homeKey
                  ? 'Chords for this key will appear here.'
                  : 'Choose a home key, then pick chords.'}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.id} className="suggest-group">
            <header className="suggest-group__head">
              <h3 className="suggest-group__title">{group.title}</h3>
              <p className="suggest-group__hint">{group.hint}</p>
            </header>
            <ul className="suggest-group__list">
              {group.items.map((s) => {
                const active = chord && chordId(chord) === chordId(s.chord)
                return (
                  <SuggestionRow
                    key={`${s.chord.root}-${s.chord.quality}-${s.feel}-${s.reason}`}
                    s={s}
                    active={active}
                    voicing={voicing}
                    bassOctave={bassOctave}
                    onAssign={onAssign}
                  />
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
