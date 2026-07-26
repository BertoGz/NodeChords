import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_METRONOME_TYPE,
  METRONOME_TYPES,
} from '../audio/playChord.js'

export default function Toolbar({
  hasStart,
  canAddNode,
  canDelete,
  canPlay,
  isPlaying,
  canRestart,
  canExport,
  canSave,
  saveStatus,
  viewMode = 'graph',
  bpm = 120,
  metronomeEnabled = true,
  metronomeType = DEFAULT_METRONOME_TYPE,
  onAddNode,
  onDelete,
  onTogglePlay,
  onRestart,
  onExportMidi,
  onImportMidi,
  onSaveFile,
  onLoadFile,
  onReset,
  onViewModeChange,
  onBpmChange,
  onToggleMetronome,
  onMetronomeTypeChange,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [metroMenuOpen, setMetroMenuOpen] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const [bpmFocused, setBpmFocused] = useState(false)
  const menuRef = useRef(null)
  const metroMenuRef = useRef(null)
  const fileInputRef = useRef(null)
  const midiInputRef = useRef(null)

  useEffect(() => {
    if (!bpmFocused) setBpmDraft(String(bpm))
  }, [bpm, bpmFocused])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!metroMenuOpen) return
    const onPointer = (e) => {
      if (!metroMenuRef.current?.contains(e.target)) setMetroMenuOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setMetroMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [metroMenuOpen])

  return (
    <div className="toolbar">
      <div className="toolbar__brand">
        <span className="toolbar__mark">NodeChords</span>
        {saveStatus && <span className="toolbar__save">{saveStatus}</span>}
      </div>
      <div className="toolbar__actions">
        <div className="view-switch" role="group" aria-label="View">
          <button
            type="button"
            className={`view-switch__btn ${viewMode === 'graph' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange?.('graph')}
          >
            Graph
          </button>
          <button
            type="button"
            className={`view-switch__btn ${viewMode === 'timing' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange?.('timing')}
          >
            Timing
          </button>
        </div>

        <button type="button" className="btn" disabled={!canAddNode} onClick={onAddNode}>
          Add node
        </button>
        <button type="button" className="btn btn--ghost" disabled={!canDelete} onClick={onDelete}>
          Delete
        </button>

        <div className="transport" role="group" aria-label="Transport">
          <button
            type="button"
            className="btn btn--transport"
            disabled={!canRestart}
            title="Restart (playhead to start)"
            aria-label="Restart"
            onClick={onRestart}
          >
            <span className="transport__icon" aria-hidden>
              ⏮
            </span>
          </button>
          <button
            type="button"
            className={`btn btn--transport btn--accent ${isPlaying ? 'is-playing' : ''}`}
            disabled={!canPlay}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={onTogglePlay}
          >
            <span className="transport__icon" aria-hidden>
              {isPlaying ? '❚❚' : '▶'}
            </span>
          </button>
        </div>

        <label className="bpm-control" title="Project tempo">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            step={1}
            value={bpmFocused ? bpmDraft : bpm}
            onFocus={() => {
              setBpmFocused(true)
              setBpmDraft(String(bpm))
            }}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={() => {
              setBpmFocused(false)
              onBpmChange?.(bpmDraft)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </label>

        <div className={`metronome-control ${metronomeEnabled ? 'is-on' : ''}`} ref={metroMenuRef}>
          <button
            type="button"
            className={`btn btn--ghost metronome-toggle ${metronomeEnabled ? 'is-on' : ''}`}
            title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
            aria-pressed={metronomeEnabled}
            onClick={() => onToggleMetronome?.(!metronomeEnabled)}
          >
            ♩ {metronomeEnabled ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className={`btn btn--ghost metronome-type-btn ${metronomeEnabled ? 'is-on' : ''}`}
            title="Metronome sound"
            aria-haspopup="menu"
            aria-expanded={metroMenuOpen}
            onClick={() => setMetroMenuOpen((open) => !open)}
          >
            ▾
          </button>
          {metroMenuOpen && (
            <div className="metronome-type-menu" role="menu">
              <p className="metronome-type-menu__title">Sound</p>
              {METRONOME_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  className={`metronome-type-menu__item ${t.id === metronomeType ? 'is-active' : ''}`}
                  onClick={() => {
                    onMetronomeTypeChange?.(t.id)
                    setMetroMenuOpen(false)
                  }}
                >
                  <span className="metronome-type-menu__label">{t.label}</span>
                  <span className="metronome-type-menu__hint">{t.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="file-menu" ref={menuRef}>
          <button
            type="button"
            className="btn btn--ghost"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            File ▾
          </button>
          {menuOpen && (
            <div className="file-menu__dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                disabled={!canExport}
                onClick={() => {
                  setMenuOpen(false)
                  onExportMidi?.()
                }}
              >
                Export MIDI
              </button>
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                disabled={!canSave}
                onClick={() => {
                  setMenuOpen(false)
                  onSaveFile?.()
                }}
              >
                Save to file…
              </button>
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                Load from file…
              </button>
              <button
                type="button"
                role="menuitem"
                className="file-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  midiInputRef.current?.click()
                }}
              >
                Import MIDI…
              </button>
              <div className="file-menu__sep" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="file-menu__item file-menu__item--danger"
                disabled={!hasStart}
                onClick={() => {
                  setMenuOpen(false)
                  onReset?.()
                }}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onLoadFile?.(file)
          }}
        />

        <input
          ref={midiInputRef}
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onImportMidi?.(file)
          }}
        />
      </div>
    </div>
  )
}
