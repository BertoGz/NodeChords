import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatChord,
  chordId,
  DEFAULT_VOICING,
  VOICINGS,
  voicingLabel,
} from '../theory/chords.js'
import { formatKey } from '../theory/keys.js'
import { groupSuggestionsByFeel } from '../theory/feel.js'
import { playChord } from '../audio/playChord.js'
import KeyPiano from './KeyPiano.jsx'

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

function SuggestionRow({ s, active, voicing, onAssign }) {
  return (
    <li>
      <button
        type="button"
        className={`suggestion suggestion--${s.feel || 'move'} ${active ? 'is-active' : ''}`}
        onClick={() => {
          playChord(s.chord, { voicing })
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
        <span className={`suggestion__tag suggestion__tag--${s.feel || 'move'}`}>
          {s.feelLabel || s.tag}
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
  onAssign,
  onClearChord,
  onStayInKey,
  onOpenModulate,
  onVoicingChange,
}) {
  const [voicingOpen, setVoicingOpen] = useState(false)
  const [pianoOpen, setPianoOpen] = useState(false)
  const voicingRef = useRef(null)
  const pianoRef = useRef(null)

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
    setVoicingOpen(false)
    setPianoOpen(false)
  }, [selectedNode?.id])

  const groups = useMemo(() => groupSuggestionsByFeel(suggestions), [suggestions])

  if (!selectedNode) {
    return (
      <aside className="panel">
        <h2 className="panel__title">Suggestions</h2>
        <p className="panel__empty">Select a node to see what the next chord can do.</p>
      </aside>
    )
  }

  const chord = selectedNode.data?.chord
  const isModulating = intent === 'modulate' && Boolean(modulateTo)

  let title = 'What should the next chord do?'
  if (mode === 'resolve') title = 'How do you want to land?'
  else if (isModulating) {
    title =
      modulateRole === 'arrival' ? 'Land in the new key' : 'Bridge toward the new key'
  }

  return (
    <aside className="panel">
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {homeKey && (
          <p className="panel__meta panel__meta--key">
            <span>
              Key: <strong>{formatKey(homeKey)}</strong>
            </span>
            <span className="key-piano-wrap" ref={pianoRef}>
              <button
                type="button"
                className={`btn-piano ${pianoOpen ? 'is-open' : ''}`}
                aria-expanded={pianoOpen}
                aria-haspopup="dialog"
                title={`Show ${formatKey(homeKey)} on piano`}
                onClick={() => setPianoOpen((open) => !open)}
              >
                ♩
              </button>
              {pianoOpen && (
                <KeyPiano homeKey={homeKey} onClose={() => setPianoOpen(false)} />
              )}
            </span>
          </p>
        )}
        {mode === 'resolve' && targetChord && (
          <p className="panel__meta">
            Closing the loop to <strong>{formatChord(targetChord)}</strong>
          </p>
        )}
        {mode === 'build' && !isModulating && (
          <p className="panel__meta">
            Pick by feel — Home settles, Move continues, Tighten pulls, Color spices
          </p>
        )}
        {isModulating && (
          <p className="panel__meta">
            {modulateRole === 'arrival'
              ? `Landing in ${formatKey(modulateTo)} — home chords for the new key`
              : `Setup toward ${formatKey(modulateTo)} — bridges that pull or pivot`}
            {chord ? ' — pick another to swap' : ''}
          </p>
        )}
        {chord && (
          <p className="panel__meta">
            Current: <strong>{formatChord(chord)}</strong>
          </p>
        )}
      </header>

      {mode === 'build' && homeKey && (
        <div className="modulate-box">
          <div className="modulate-box__tabs" role="group" aria-label="Suggestion intent">
            <button
              type="button"
              className={`modulate-box__tab ${!isModulating ? 'is-active' : ''}`}
              onClick={() => onStayInKey?.()}
            >
              Stay in key
            </button>
            <button
              type="button"
              className={`modulate-box__tab ${isModulating ? 'is-active' : ''}`}
              onClick={() => onOpenModulate?.()}
            >
              {isModulating ? 'Change modulate…' : 'Modulate…'}
            </button>
          </div>
        </div>
      )}

      {chord && (
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => playChord(chord, { voicing })}
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
              onClick={() => setVoicingOpen((open) => !open)}
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
                      playChord(chord, { voicing: v.id })
                    }}
                  >
                    <span className="voicing-menu__label">{v.label}</span>
                    <span className="voicing-menu__hint">{v.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!selectedNode.data?.isStart && (
            <button type="button" className="btn btn--ghost" onClick={onClearChord}>
              Clear chord
            </button>
          )}
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
                  ? 'Suggestions for this key will appear here.'
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
