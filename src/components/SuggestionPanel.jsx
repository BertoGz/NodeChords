import { formatChord, chordId } from '../theory/chords.js'
import { formatKey } from '../theory/keys.js'
import { playChord } from '../audio/playChord.js'

export default function SuggestionPanel({
  selectedNode,
  mode,
  suggestions,
  targetChord,
  homeKey,
  intent,
  modulateTo,
  modulateRole,
  onAssign,
  onPlay,
  onClearChord,
  onLoopToStart,
  canLoopToStart,
  onStayInKey,
  onOpenModulate,
}) {
  if (!selectedNode) {
    return (
      <aside className="panel">
        <h2 className="panel__title">Suggestions</h2>
        <p className="panel__empty">Select a node to see Build, Resolve, or modulation pathways.</p>
      </aside>
    )
  }

  const chord = selectedNode.data?.chord
  const isModulating = intent === 'modulate' && Boolean(modulateTo)

  let title = 'Build'
  if (mode === 'resolve') title = 'Resolve'
  else if (isModulating) title = 'Modulate'

  return (
    <aside className="panel">
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {homeKey && (
          <p className="panel__meta">
            Key: <strong>{formatKey(homeKey)}</strong>
          </p>
        )}
        {mode === 'resolve' && targetChord && (
          <p className="panel__meta">
            Closing the loop to <strong>{formatChord(targetChord)}</strong>
          </p>
        )}
        {mode === 'build' && !isModulating && (
          <p className="panel__meta">Click a chord to set it on the selected node</p>
        )}
        {isModulating && (
          <p className="panel__meta">
            {modulateRole === 'arrival'
              ? `Landing in ${formatKey(modulateTo)} — arrival chords only`
              : `Setup toward ${formatKey(modulateTo)} — bridges & pivots`}
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

      {canLoopToStart && (
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost" onClick={onLoopToStart}>
            Loop to Start → Resolve
          </button>
        </div>
      )}

      {chord && (
        <div className="panel__actions">
          <button type="button" className="btn btn--ghost" onClick={() => playChord(chord)}>
            Play chord
          </button>
          {!selectedNode.data?.isStart && (
            <button type="button" className="btn btn--ghost" onClick={onClearChord}>
              Clear chord
            </button>
          )}
        </div>
      )}

      <ul className="suggestions">
        {suggestions.length === 0 && (
          <li className="suggestions__empty">
            {mode === 'resolve'
              ? 'Cadence chords will appear here, or pick from the palette.'
              : isModulating
                ? 'Bridge chords toward the target will appear here.'
                : homeKey
                  ? 'Diatonic chords for this key will appear here.'
                  : 'Choose a home key, then pick chords.'}
          </li>
        )}
        {suggestions.map((s) => {
          const active = chord && chordId(chord) === chordId(s.chord)
          return (
            <li key={`${s.chord.root}-${s.chord.quality}-${s.reason}`}>
              <button
                type="button"
                className={`suggestion ${active ? 'is-active' : ''}`}
                onClick={() => {
                  playChord(s.chord)
                  onAssign(s.chord)
                }}
              >
                <span className="suggestion__symbol">{s.symbol}</span>
                <span className="suggestion__reason">{s.reason}</span>
                {s.tag && <span className="suggestion__tag">{s.tag}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
