import { SearchIcon, XIcon, FilterIcon, ChevronDownIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Optional filter toggle button */
  filterOpen?: boolean;
  onToggleFilter?: () => void;
  /** Extra controls on the right side of the search bar */
  extra?: ReactNode;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = '搜索...',
  filterOpen,
  onToggleFilter,
  extra,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-3 mb-4 px-8 flex-shrink-0">
      <div
        className="flex items-center gap-2 flex-1 px-4 py-2 rounded-lg"
        style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
      >
        <SearchIcon size={15} style={{ color: 'var(--wiki-text3)' }} />
        <input
          className="bg-transparent flex-1 text-xs outline-none text-wiki-text placeholder:text-wiki-text3"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="text-wiki-text3 hover:text-wiki-text transition-colors"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>
      {onToggleFilter && (
        <button
          onClick={onToggleFilter}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
            color: 'var(--wiki-text2)',
          }}
        >
          <FilterIcon size={14} />
          <span>筛选</span>
          <ChevronDownIcon
            size={12}
            style={{
              transform: filterOpen ? 'rotate(180deg)' : 'none',
              transition: '0.2s',
            }}
          />
        </button>
      )}
      {extra}
    </div>
  );
}

// ── Filter Pills ──

export interface FilterPill {
  key: string;
  label: string;
  count?: number;
  color?: string;
  /** Optional icon element */
  icon?: ReactNode;
}

interface FilterPillsProps {
  items: FilterPill[];
  activeKey: string;
  onChange: (key: string) => void;
}

export function FilterPills({ items, activeKey, onChange }: FilterPillsProps) {
  return (
    <div className="flex gap-3 mb-4 px-8 flex-shrink-0 flex-wrap">
      {items.map((item) => {
        const isActive = activeKey === item.key;
        const activeColor = item.color || 'var(--wiki-text)';
        return (
          <div
            key={item.key}
            onClick={() => onChange(item.key === activeKey ? (item.key === '全部' || item.key === 'all' ? activeKey : '全部') : item.key)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors"
            style={{
              background: isActive ? activeColor : 'var(--wiki-surface)',
              color: isActive ? (item.key === '全部' || item.key === 'all' ? 'var(--wiki-bg)' : '#fff') : 'var(--wiki-text3)',
              border: isActive ? 'none' : '1px solid var(--wiki-border)',
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: isActive
                  ? item.key === '全部' || item.key === 'all'
                    ? 'var(--wiki-bg)'
                    : '#fff'
                  : activeColor,
              }}
            />
            <span className="text-xs font-medium">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
