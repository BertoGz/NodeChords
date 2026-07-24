import { useMemo, useState } from 'react'
import { ROOT_NAMES, QUALITIES, QUALITY_LABELS, formatChord } from '../theory/chords.js'
import { MODES, createKey, diatonicChords, formatKey } from '../theory/keys.js'
import { playChord } from '../audio/playChord.js'

export default function ChordPalette({
  onPick,
  disabled,
  title,
  subtitle,
  homeKey,
  onHomeKeyChange,
  preferDiatonic,
  showKeyPicker,
}) {
  const [query, setQuery] = useState('')
  const [rootFilter, setRootFilter] = useState(null)
  const [diatonicOnly, setDiatonicOnly] = useState(Boolean(preferDiatonic))

  const diatonicIds = useMemo(() => {
    if (!homeKey) return null
    return new Set(diatonicChords(homeKey).map((d) => `${d.chord.root}:${d.chord.quality}`))
  }, [homeKey])

  const chords = useMemo(() => {
    let list = []
    if (diatonicOnly && homeKey) {
      list = diatonicChords(homeKey).map((d) => d.chord)
    } else {
      for (let root = 0; root < 12; root++) {
        if (rootFilter !== null && root !== rootFilter) continue
        for (const quality of QUALITIES) {
          list.push({ root, quality })
        }
      }
    }
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => formatChord(c).toLowerCase().includes(q))
  }, [query, rootFilter, diatonicOnly, homeKey])

  return (
    <aside className="palette">
      <header className="palette__header">
        <h2 className="palette__title">{title}</h2>
        {subtitle && <p className="palette__subtitle">{subtitle}</p>}

        {showKeyPicker && (
          <div className="key-picker">
            <label className="key-picker__field">
              <span>Tonic</span>
              <select
                value={homeKey?.tonic ?? 0}
                onChange={(e) =>
                  onHomeKeyChange?.(createKey(Number(e.target.value), homeKey?.mode ?? 'major'))
                }
              >
                {ROOT_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="key-picker__field">
              <span>Mode</span>
              <select
                value={homeKey?.mode ?? 'major'}
                onChange={(e) =>
                  onHomeKeyChange?.(createKey(homeKey?.tonic ?? 0, e.target.value))
                }
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            {homeKey && (
              <p className="key-picker__active">Home: {formatKey(homeKey)}</p>
            )}
          </div>
        )}

        <input
          className="palette__search"
          type="search"
          placeholder="Search chords…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
        />

        {homeKey && (
          <label className="palette__diatonic-toggle">
            <input
              type="checkbox"
              checked={diatonicOnly}
              onChange={(e) => setDiatonicOnly(e.target.checked)}
            />
            <span>In-key only ({formatKey(homeKey)})</span>
          </label>
        )}

        {!diatonicOnly && (
          <div className="palette__roots" role="group" aria-label="Filter by root">
            <button
              type="button"
              className={`palette__root ${rootFilter === null ? 'is-active' : ''}`}
              onClick={() => setRootFilter(null)}
            >
              All
            </button>
            {ROOT_NAMES.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`palette__root ${rootFilter === i ? 'is-active' : ''}`}
                onClick={() => setRootFilter(i)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </header>
      <div className="palette__grid">
        {chords.map((chord) => {
          const symbol = formatChord(chord)
          const inKey = diatonicIds?.has(`${chord.root}:${chord.quality}`)
          return (
            <button
              key={`${chord.root}-${chord.quality}`}
              type="button"
              className={`palette__chord ${inKey ? 'palette__chord--inkey' : ''}`}
              disabled={disabled}
              title={QUALITY_LABELS[chord.quality] || chord.quality}
              onClick={() => {
                playChord(chord)
                onPick?.(chord)
              }}
            >
              {symbol}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
