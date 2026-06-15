import { useState, useEffect, type ReactNode } from 'react';
import { GridIcon, ListIcon } from 'lucide-react';
import UnifiedSidebar from './UnifiedSidebar';
import PageHeader from './PageHeader';
import SearchBar, { FilterPills, type FilterPill } from './SearchBar';
import EmptyState from './EmptyState';

export interface DataPageProps {
  // ── Sidebar ──
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidebarTitle: string;
  /** Sidebar item buttons (add/edit/delete) */
  sidebarActions?: ReactNode;
  /** Fixed content at bottom of sidebar */
  sidebarFooter?: ReactNode;
  /** Sidebar item elements (SidebarItem components) */
  sidebarItems: ReactNode;

  // ── Header ──
  title: string;
  description: string;
  headerActions?: ReactNode;

  // ── Search (built-in 300ms debounce) ──
  /** Set to true to hide the search bar entirely (e.g. AppEcosystem) */
  hideSearch?: boolean;
  searchPlaceholder?: string;
  /** Called with the debounced search value whenever it changes */
  onSearchDebounced?: (value: string) => void;
  /** Optional initial search value */
  initialSearch?: string;

  // ── Filter (optional) ──
  filterOpen?: boolean;
  onToggleFilter?: () => void;
  filterPanel?: ReactNode;
  filterPills?: FilterPill[];
  activePillKey?: string;
  onPillChange?: (key: string) => void;

  // ── View mode ──
  /** Set to true to hide the grid/list toggle button */
  hideViewToggle?: boolean;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;

  // ── Content ──
  isEmpty: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Pass true when data is being fetched for the first time (shows loading skeleton) */
  loading?: boolean;
  /** Grid or list items rendered by parent */
  children: ReactNode;

  // ── Pagination (optional) ──
  page?: number;
  totalPages?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;

  // ── Extra ──
  /** Extra controls on the right side of search bar */
  searchExtra?: ReactNode;
}

/**
 * DataPage — unified layout shell for list-oriented pages.
 *
 * Provides: sidebar + header + debounced search + filter pills + view toggle +
 * empty/loading states + pagination. The parent renders sidebar items and
 * grid/list content as children.
 *
 * Used by: Requirements (采集库), Knowledge (知识库), AppEcosystem (应用生态)
 */
export default function DataPage({
  sidebarOpen,
  onToggleSidebar,
  sidebarTitle,
  sidebarActions,
  sidebarFooter,
  sidebarItems,
  title,
  description,
  headerActions,
  hideSearch = false,
  searchPlaceholder = '搜索...',
  onSearchDebounced,
  initialSearch = '',
  filterOpen,
  onToggleFilter,
  filterPanel,
  filterPills,
  activePillKey,
  onPillChange,
  hideViewToggle = false,
  viewMode = 'list',
  onViewModeChange,
  isEmpty,
  emptyTitle = '暂无数据',
  emptyDescription = '点击按钮开始添加',
  loading = false,
  children,
  page,
  totalPages,
  totalCount,
  onPageChange,
  searchExtra,
}: DataPageProps) {
  // ── Built-in 300ms search debounce ──
  const [searchInput, setSearchInput] = useState(initialSearch);

  useEffect(() => {
    if (!onSearchDebounced) return;
    const timer = setTimeout(() => onSearchDebounced(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput, onSearchDebounced]);

  // Sync external initialSearch changes (e.g., reset from parent)
  useEffect(() => {
    setSearchInput(initialSearch);
  }, [initialSearch]);

  // Build search bar extra content (view toggle + custom extras)
  const searchBarExtra = (
    <>
      {!hideViewToggle && onViewModeChange && (
        <button
          onClick={() => onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs"
          style={{
            background: 'var(--wiki-surface)',
            border: '1px solid var(--wiki-border)',
            color: 'var(--wiki-text2)',
          }}
        >
          {viewMode === 'grid' ? <ListIcon size={13} /> : <GridIcon size={13} />}
          <span>{viewMode === 'grid' ? '列表' : '网格'}</span>
        </button>
      )}
      {searchExtra}
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar */}
      <UnifiedSidebar
        open={sidebarOpen}
        onToggle={() => onToggleSidebar()}
        title={sidebarTitle}
        actions={sidebarActions}
        footer={sidebarFooter}
      >
        {sidebarItems}
      </UnifiedSidebar>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <PageHeader
          title={title}
          description={description}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          actions={headerActions}
        />

        {!hideSearch && (
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder={searchPlaceholder}
            filterOpen={filterOpen}
            onToggleFilter={onToggleFilter}
            extra={searchBarExtra}
          />
        )}

        {/* Filter Panel (expandable) */}
        {filterPanel}

        {/* Filter Pills */}
        {filterPills && activePillKey !== undefined && onPillChange && (
          <FilterPills
            items={filterPills}
            activeKey={activePillKey}
            onChange={onPillChange}
          />
        )}

        {/* Content Area */}
        <div
          className="overflow-y-auto scrollbar-thin flex-1 px-8 pb-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3'
                : 'flex flex-col gap-2.5'
            }
          >
            {loading ? (
              // Simple loading skeleton — 3 placeholder cards
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg animate-pulse"
                  style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
                >
                  <div className="h-4 w-3/4 rounded mb-3" style={{ background: 'var(--wiki-surface2)' }} />
                  <div className="h-3 w-full rounded mb-2" style={{ background: 'var(--wiki-surface2)' }} />
                  <div className="h-3 w-1/2 rounded" style={{ background: 'var(--wiki-surface2)' }} />
                </div>
              ))
            ) : isEmpty ? (
              <EmptyState
                title={emptyTitle}
                description={emptyDescription}
              />
            ) : (
              children
            )}
          </div>
        </div>

        {/* Pagination */}
        {page !== undefined && totalPages !== undefined && onPageChange && totalPages > 1 && (
          <div
            className="flex items-center justify-center gap-3 px-6 py-2 flex-shrink-0"
            style={{ borderTop: '1px solid var(--wiki-border)' }}
          >
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded text-xs hover:bg-wiki-surface2 disabled:opacity-30 transition-colors"
              style={{ color: 'var(--wiki-text2)' }}
            >
              上一页
            </button>
            <span className="text-xs text-wiki-text2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded text-xs hover:bg-wiki-surface2 disabled:opacity-30 transition-colors"
              style={{ color: 'var(--wiki-text2)' }}
            >
              下一页
            </button>
            {totalCount !== undefined && (
              <span className="text-xs text-wiki-text3">共 {totalCount} 条</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { FilterPills };
export type { FilterPill };
