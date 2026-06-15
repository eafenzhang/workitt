import React from 'react';
import { type ProviderModel } from '../data/providers';

interface ModelSelectorProps {
  models: ProviderModel[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

/**
 * Model selector — renders a <select> when preset models exist,
 * otherwise falls back to a free-text <input> for custom model IDs.
 */
export default function ModelSelector({ models, value, onChange, disabled }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-wiki-text3 mb-1.5">模型</label>
      {models.length > 0 ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg text-xs outline-none disabled:opacity-50"
          style={{
            background: 'var(--wiki-surface2)',
            border: '1px solid var(--wiki-border)',
            color: 'var(--wiki-text)',
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入模型 ID"
          className="w-full px-3 py-2 rounded-lg text-xs outline-none"
          style={{
            background: 'var(--wiki-surface2)',
            border: '1px solid var(--wiki-border)',
            color: 'var(--wiki-text)',
          }}
        />
      )}
    </div>
  );
}
