import { type ReactNode, type ElementType } from 'react';
import { FileTextIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon: Icon = FileTextIcon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      className="col-span-full flex flex-col items-center justify-center py-16 rounded-lg"
      style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'var(--wiki-surface2)' }}
      >
        <Icon size={32} style={{ color: 'var(--wiki-text3)' }} />
      </div>
      <p className="text-sm font-medium text-wiki-text2">{title}</p>
      <p className="text-xs text-wiki-text3 mt-1.5">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
