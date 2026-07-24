import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { formatChord } from '../theory/chords.js'
import { formatKey } from '../theory/keys.js'

function ChordNodeComponent({ data, selected }) {
  const {
    chord,
    isStart,
    mode,
    targetSymbol,
    key,
    intent,
    modulateTo,
    modulateRole,
    playing,
  } = data
  const filled = Boolean(chord)
  const symbol = filled ? formatChord(chord) : '—'
  const modulating = intent === 'modulate' && modulateTo

  let stepLabel = null
  if (modulating) {
    if (modulateRole === 'arrival') {
      stepLabel = `Modulation land → ${formatKey(modulateTo)}`
    } else {
      stepLabel = `Modulation step → ${formatKey(modulateTo)}`
    }
  }

  let modeLabel = null
  if (!filled && !stepLabel) {
    if (mode === 'resolve') modeLabel = `Resolve → ${targetSymbol || 'I'}`
    else if (mode === 'build') modeLabel = 'Build'
  }

  return (
    <div
      className={[
        'chord-node',
        filled ? 'chord-node--filled' : 'chord-node--empty',
        modulating ? 'chord-node--modulate' : '',
        modulateRole === 'arrival' ? 'chord-node--mod-land' : '',
        modulateRole === 'setup' ? 'chord-node--mod-step' : '',
        isStart ? 'chord-node--start' : '',
        selected ? 'chord-node--selected' : '',
        playing ? 'chord-node--playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Handle type="target" position={Position.Left} className="chord-handle" />
      {isStart && <span className="chord-node__tag">Start</span>}
      {stepLabel && (
        <span
          className={`chord-node__mod-label chord-node__mod-label--${modulateRole || 'setup'}`}
        >
          {stepLabel}
        </span>
      )}
      {key && <span className="chord-node__key">{formatKey(key)}</span>}
      {!filled && modeLabel && (
        <span className={`chord-node__mode chord-node__mode--${mode || 'build'}`}>
          {modeLabel}
        </span>
      )}
      <span className="chord-node__symbol">{symbol}</span>
      {!filled && (
        <span className="chord-node__hint">
          {modulateRole === 'arrival'
            ? 'pick landing chord'
            : modulateRole === 'setup'
              ? 'pick setup chord'
              : 'pick a chord'}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="chord-handle" />
    </div>
  )
}

export default memo(ChordNodeComponent)
