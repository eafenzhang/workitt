import React from 'react';

interface ProviderLogoProps { providerId?: string; size?: number; }

const COLORS: Record<string, string> = {
  deepseek: '#4F46E5', minimax: '#F59E0B', mimo: '#EC4899', zhipu: '#6366F1',
  moonshot: '#10B981', dashscope: '#06B6D4', volcengine: '#8B5CF6', tencent: '#14B8A6',
  qianfan: '#F43F5E', siliconflow: '#EAB308', custom: '#6B7280',
};

const LABELS: Record<string, string> = {
  deepseek: 'DS', minimax: 'MM', mimo: 'Mi', zhipu: '智', moonshot: 'MS',
  dashscope: 'QW', volcengine: '豆', tencent: '混', qianfan: '文', siliconflow: '硅', custom: '+',
};

export default function ProviderLogo({ providerId = 'custom', size = 48 }: ProviderLogoProps) {
  const id = COLORS[providerId] ? providerId : 'custom';
  const bg = COLORS[id];
  const label = LABELS[id];
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} rx={size * 0.26} fill={bg} />
        <text x={size / 2} y={size * 0.67} textAnchor="middle" fill="white"
          fontSize={size * 0.36} fontWeight="bold" fontFamily="system-ui">
          {label}
        </text>
      </svg>
    </div>
  );
}
