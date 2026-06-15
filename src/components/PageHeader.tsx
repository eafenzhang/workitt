import { type ReactNode } from 'react';
import { SidebarToggle } from './UnifiedSidebar';

interface PageHeaderProps {
  title: string;
  description: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  sidebarOpen,
  onToggleSidebar,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4 px-8 pt-8 flex-shrink-0">
      <div className="flex items-center gap-2">
        <SidebarToggle open={sidebarOpen} onToggle={onToggleSidebar} />
        <div>
          <h1 className="text-xl font-semibold text-wiki-text">{title}</h1>
          <p className="text-wiki-text2 text-sm mt-1">{description}</p>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
