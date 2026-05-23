import { useEffect, useRef, useState } from 'react'
import { Bot, Check, ChevronDown } from 'lucide-react'
import type { AiModel } from '../api/clientApi'
import { getModelLabel } from '../lib/generationOptions'

type ModelPickerProps = {
  models: AiModel[]
  value: string
  onChange: (value: string) => void
  emptyText?: string
  compact?: boolean
}

export function ModelPicker({
  models,
  value,
  onChange,
  emptyText = '暂无可用模型',
  compact = false,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedModel = models.find((model) => model.id === value)

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [])

  return (
    <div className={`model-picker ${compact ? 'compact' : ''}`} ref={rootRef}>
      <button
        className={open ? 'model-picker-trigger active' : 'model-picker-trigger'}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="model-picker-icon">
          <Bot size={14} aria-hidden="true" />
        </span>
        <span>
          <strong>{selectedModel ? getModelLabel(selectedModel) : emptyText}</strong>
          {selectedModel?.providerName && <small>{selectedModel.providerName}</small>}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="model-picker-menu">
          {models.length === 0 && <div className="model-picker-empty">{emptyText}</div>}
          {models.map((model) => (
            <button
              className={model.id === value ? 'selected' : ''}
              key={model.id}
              onClick={() => {
                onChange(model.id)
                setOpen(false)
              }}
              type="button"
            >
              <span className="model-option-icon">
                <Bot size={14} aria-hidden="true" />
              </span>
              <span>
                <strong>{getModelLabel(model)}</strong>
                <small>{model.providerName || model.modelName}</small>
              </span>
              <span className="model-option-check">
                {model.id === value && <Check size={14} aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
