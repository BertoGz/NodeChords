import { useEffect, useMemo, useState } from 'react'
import { formatKey, modulationTargets } from '../theory/keys.js'

const SETUP_OPTIONS = [
  {
    value: 1,
    label: '1 — Direct',
    hint: 'Land on the new key on this node (arrival).',
  },
  {
    value: 2,
    label: '2 — Setup + land',
    hint: 'This node is a bridge; an empty landing node is added.',
  },
  {
    value: 3,
    label: '3 — Extended bridge',
    hint: 'Two setup nodes, then a landing node (e.g. ii–V–I).',
  },
]

export default function ModulateModal({
  open,
  fromKey,
  initialTarget = null,
  initialSetupLength = 1,
  onConfirm,
  onCancel,
}) {
  const targets = useMemo(
    () => (fromKey ? modulationTargets(fromKey) : []),
    [fromKey],
  )

  const [targetValue, setTargetValue] = useState('')
  const [setupLength, setSetupLength] = useState(1)

  useEffect(() => {
    if (!open) return
    if (initialTarget) {
      setTargetValue(`${initialTarget.tonic}:${initialTarget.mode}`)
    } else {
      setTargetValue(targets[0] ? `${targets[0].key.tonic}:${targets[0].key.mode}` : '')
    }
    setSetupLength(initialSetupLength || 1)
  }, [open, initialTarget, initialSetupLength, targets])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const selectedOption = SETUP_OPTIONS.find((o) => o.value === setupLength)
  const canConfirm = Boolean(targetValue)

  const handleConfirm = () => {
    if (!canConfirm) return
    const [tonic, mode] = targetValue.split(':')
    onConfirm?.({
      key: { tonic: Number(tonic), mode },
      setupLength,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal modal--modulate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modulate-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modulate-modal-title" className="modal__title">
          Modulate
        </h2>
        <p className="modal__message">
          From <strong>{fromKey ? formatKey(fromKey) : '—'}</strong>
        </p>

        <label className="modal__field">
          <span>To key</span>
          <select value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            <option value="">Select target key…</option>
            <optgroup label="Near">
              {targets
                .filter((t) => t.distanceLabel === 'near')
                .map((t) => (
                  <option key={`${t.key.tonic}:${t.key.mode}`} value={`${t.key.tonic}:${t.key.mode}`}>
                    {t.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Medium">
              {targets
                .filter((t) => t.distanceLabel === 'medium')
                .map((t) => (
                  <option key={`${t.key.tonic}:${t.key.mode}`} value={`${t.key.tonic}:${t.key.mode}`}>
                    {t.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Distant (may feel abrupt)">
              {targets
                .filter((t) => t.distanceLabel === 'distant')
                .map((t) => (
                  <option key={`${t.key.tonic}:${t.key.mode}`} value={`${t.key.tonic}:${t.key.mode}`}>
                    {t.label}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>

        <label className="modal__field">
          <span>Setup length</span>
          <select
            value={setupLength}
            onChange={(e) => setSetupLength(Number(e.target.value))}
          >
            {SETUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {selectedOption && <p className="modal__hint">{selectedOption.hint}</p>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Start modulation
          </button>
        </div>
      </div>
    </div>
  )
}
