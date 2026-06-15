import type { ModelItem } from '../data/providers';

interface ModelStatsBarProps {
  models: ModelItem[];
}

/** Reads persisted token usage from localStorage */
function getTokenUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('model_token_usage') || '{}') as Record<string, number>;
  } catch {
    return {} as Record<string, number>;
  }
}

/** Format large numbers as K / M */
function fmt(n: number): string {
  if (n > 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M';
  }
  if (n > 1_000) {
    return (n / 1_000).toFixed(1) + 'K';
  }
  return String(n);
}

/** Dashboard stats bar showing model counts, token usage & default model */
export default function ModelStatsBar({ models }: ModelStatsBarProps) {
  const tokens = getTokenUsage();
  const total = Object.values(tokens).reduce((a, b) => a + b, 0);

  const defaultModel = models.find((m) => m.isDefault);
  const defaultLabel = defaultModel?.name?.split(' - ').pop() || '未设置';

  const items = [
    {
      label: '已配置',
      value: models.length,
      color: 'var(--wiki-text)',
    },
    {
      label: '已启用',
      value: models.filter((m) => m.enabled).length,
      color: 'var(--wiki-success)',
    },
    {
      label: 'Token 用量',
      value: fmt(total),
      color: 'var(--wiki-primary, #6366f1)',
    },
    {
      label: '默认模型',
      value: defaultLabel,
      color: 'var(--wiki-warning)',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg p-4"
          style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
          }}
        >
          <div className="text-xs text-wiki-text3">{stat.label}</div>
          <div
            className="text-lg font-bold mt-1 truncate"
            style={{ color: stat.color }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
