import React, { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface ApiKeyInputProps {
  value: string;
  onChange: (v: string) => void;
  masked?: boolean;
}

/** Reusable API Key input with show/hide toggle and saved-key mask support */
export default function ApiKeyInput({ value, onChange, masked }: ApiKeyInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="block text-xs font-medium text-wiki-text3 mb-1.5">API Key</label>
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={masked ? '输入新 Key 覆盖已保存的 Key' : '输入 API Key'}
          className="flex-1 px-3 py-2 rounded-lg text-xs outline-none placeholder:text-[10px]"
          style={{
            background: 'var(--wiki-surface2)',
            border: '1px solid var(--wiki-border)',
            color: 'var(--wiki-text)',
          }}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="px-2 rounded-lg"
          style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}
        >
          {show ? (
            <EyeOffIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
          ) : (
            <EyeIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
          )}
        </button>
      </div>
    </div>
  );
}
