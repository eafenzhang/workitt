import { apiFetch } from '../api';
import { useEffect, useState, useRef, useMemo, memo, useCallback } from 'react';
import { PlusIcon, SearchIcon, FilterIcon, SparklesIcon, CheckCircleIcon, AlertCircleIcon, UserIcon, CalendarIcon, XIcon, EditIcon, TrashIcon, ImageIcon, ChevronDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, FileTextIcon, FileIcon, ArchiveIcon, CodeIcon, GridIcon, ListIcon, EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { ContentBlock } from '../types/content';
import ContentBlockRenderer from '../components/ContentBlockRenderer';
import { rebuildBlocksFromLegacy } from '../utils/contentBlocks';
import { DOC_EXTS, ARCHIVE_EXTS, CODE_EXTS, getFileExt, getFileCategory, formatFileSize } from '../components/FileChip';
import DataPage, { type FilterPill } from '../components/DataPage';
import { SidebarItem } from '../components/UnifiedSidebar';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

function getFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || url);
  } catch { return url; }
}

function isFileUrl(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('http://') || t.startsWith('https://')) {
    const ext = getFileExt(t);
    if (DOC_EXTS.includes(ext) || ARCHIVE_EXTS.includes(ext) || CODE_EXTS.includes(ext)) return true;
  }
  return false;
}

function ReqFileChip({ url }: { url: string }) {
  const name = getFileNameFromUrl(url);
  const ext = getFileExt(name);
  const cat = getFileCategory(ext);
  const Icon = cat === 'archive' ? ArchiveIcon : cat === 'doc' ? FileTextIcon : cat === 'code' ? CodeIcon : FileIcon;
  const colors: Record<string, string> = { archive: '#f59e0b', doc: '#6366f1', code: '#10b981', file: '#8b5cf6' };
  const color = colors[cat];

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg hover:opacity-80 transition-opacity" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)', maxWidth: '280px', textDecoration: 'none' }}>
      <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: color + '20' }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-wiki-text truncate">{name}</div>
      </div>
    </a>
  );
}

interface Requirement {
  id: number;
  title: string;
  desc: string;
  category: string;
  module: string;
  priority: string;
  status: string;
  assignee: string;
  creator: string;
  dueDate: string;
  tags: string[];
  images: string[];
  aiSummary: string;
  aiTags: string[];
  imageDescriptions: string[];
  workflowHandler: string;
  workflowHistory: { from: string; to: string; handler: string; time: string }[];
  contentBlocks?: ContentBlock[];
  createdAt: string;
  updatedAt: string;
}

interface Props {
  initialTab?: { type: string; reqId?: number; params?: any };
  onOpenSubTab?: (title: string, type: string, extra?: { reqId?: number }) => void;
  onCloseSelf?: () => void;
}

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircleIcon }> = {
  '待评估': { color: `#f59e0b`, bg: `rgba(245,158,11,0.12)`, icon: AlertCircleIcon },
  '设计中': { color: `#6366f1`, bg: `rgba(99,102,241,0.12)`, icon: EditIcon },
  '实现中': { color: `#06b6d4`, bg: `rgba(6,182,212,0.12)`, icon: ArrowUpIcon },
  '测试中': { color: `#8b5cf6`, bg: `rgba(139,92,246,0.12)`, icon: SearchIcon },
  '已完成': { color: `#10b981`, bg: `rgba(16,185,129,0.12)`, icon: CheckCircleIcon },
};

const priorityConfig: Record<string, { color: string; bg: string }> = {
  '无': { color: `var(--wiki-text3)`, bg: `rgba(128,128,128,0.1)` },
  '高': { color: `#ef4444`, bg: `rgba(239,68,68,0.12)` },
  '中': { color: `#f59e0b`, bg: `rgba(245,158,11,0.12)` },
  '低': { color: `#10b981`, bg: `rgba(16,185,129,0.12)` },
};

const priorities = ['无', '高', '中', '低'];

// Memoized list item
const ReqListItem = memo(function ReqListItem({
  req, onOpen, formatDate, onPriorityChange,
}: {
  req: Requirement;
  onOpen: (req: Requirement) => void;
  formatDate: (d: string) => string;
  onPriorityChange?: (reqId: number, p: string) => void;
}) {
  const priorityCfg = priorityConfig[req.priority] || priorityConfig['中'];
  const statusCfg = statusConfig[req.status] || statusConfig['待评估'];
  return (
    <div onClick={() => onOpen(req)}
      className="px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-150 group flex items-center gap-3"
      style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--wiki-surface2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--wiki-surface)'; }}>
      {/* Left: priority badge with inline edit */}
      <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
        <select
          value={req.priority}
          onChange={e => onPriorityChange?.(req.id, e.target.value)}
          className="text-xs font-bold px-1.5 py-0.5 rounded appearance-none cursor-pointer outline-none text-center"
          style={{ background: priorityCfg.bg, color: priorityCfg.color, border: 'none', width: '28px' }}
          title="修改优先级">
          {priorities.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-wiki-text truncate">{req.title}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0"
            style={{ background: statusCfg.bg, color: statusCfg.color }}>
            {req.status}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-wiki-text3 truncate flex-1">{req.aiSummary || req.desc?.substring(0, 80) || '暂无描述'}</span>
          <div className="flex items-center gap-2 text-xs text-wiki-text3 flex-shrink-0 ml-3">
            <span className="flex items-center gap-0.5"><CalendarIcon size={10} />{formatDate(req.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// Memoized content blocks renderer for detail view — avoids rebuildBlocksFromLegacy on every render
const MemoizedContentBlocks = memo(function MemoizedContentBlocks({
  rawBlocks, desc, images,
}: {
  rawBlocks?: ContentBlock[];
  desc: string;
  images: string[];
}) {
  const blocks = useMemo(() => {
    if (rawBlocks && rawBlocks.length > 0) return rawBlocks;
    return rebuildBlocksFromLegacy(desc || '', images || []);
  }, [rawBlocks, desc, images]);
  return <ContentBlockRenderer blocks={blocks} />;
});

function WorkflowHistory({ history, currentStatus }: { history: { from: string; to: string; handler: string; time: string; memo?: string; at?: string }[]; currentStatus: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-8 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-wiki-text3 hover:text-wiki-text2 transition-colors w-full">
        <ChevronDownIcon size={10} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        <span>操作记录 ({history.length})</span>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 max-h-[200px] overflow-y-auto scrollbar-thin">
          {history.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1 px-2 rounded" style={{ background: 'var(--wiki-surface2)' }}>
              <span className="px-1 py-0.5 rounded text-xs flex-shrink-0" style={{ background: statusConfig[h.from]?.bg || 'var(--wiki-surface)', color: statusConfig[h.from]?.color || 'var(--wiki-text3)' }}>{h.from}</span>
              <span style={{ color: 'var(--wiki-text3)' }}>→</span>
              <span className="px-1 py-0.5 rounded text-xs flex-shrink-0" style={{ background: statusConfig[h.to]?.bg || 'var(--wiki-surface)', color: statusConfig[h.to]?.color || 'var(--wiki-text3)' }}>{h.to}</span>
              <span className="flex-1 min-w-0 text-wiki-text3 ml-1">
                {h.handler && <span className="mr-2">{h.handler}</span>}
                {h.time && <span className="mr-2">{h.time}</span>}
                {h.memo && <span className="text-wiki-text2">{h.memo}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Requirements({ initialTab, onOpenSubTab, onCloseSelf }: Props) {
  const user = { nickname: 'Workitt' };
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [filterStatus, setFilterStatus] = useState('全部');
  const [filterPriority, setFilterPriority] = useState('全部');
  const [filterCategory, setFilterCategory] = useState('全部');
  const [filterAssignee, setFilterAssignee] = useState('全部');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [moduleSidebarOpen, setModuleSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;
  // Internal view routing — allows edit to stay in same tab and return to detail
  const [localView, setLocalView] = useState<string | null>(null);
  const [localReqId, setLocalReqId] = useState<number | null>(null);
  // Status counts from API (unfiltered, for the status bar)
  const [allStatusCounts, setAllStatusCounts] = useState<Record<string, number>>({ '待评估': 0, '设计中': 0, '实现中': 0, '测试中': 0, '已完成': 0 });
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState({ title: '', desc: '', module: '用户端', priority: '无', remark: '' });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  // Status transition remark modal
  const [remarkModal, setRemarkModal] = useState<{ step: string; reqId: number } | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  // Dynamic modules from API
  const [moduleList, setModuleList] = useState<{ id: number; name: string }[]>([]);
  const [showModuleModal, setShowModuleModal] = useState<{ id?: number; name: string } | null>(null);
  const [moduleDeleteTarget, setModuleDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const modules = useMemo(() => moduleList.map(m => m.name), [moduleList]);
  const previewImages = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoAnalyzeRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup auto-analyze timer on unmount
  useEffect(() => () => { if (autoAnalyzeRef.current) clearTimeout(autoAnalyzeRef.current); }, []);

  // Effective view: local state overrides initialTab prop (for internal edit→detail switching)
  const viewType = localView ?? (initialTab?.type || 'requirements');
  const detailReqId = localReqId ?? initialTab?.reqId;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Keyboard navigation for image preview lightbox
  useEffect(() => {
    if (!previewImage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
      else if (e.key === 'ArrowLeft') setPreviewIdx(i => { const n = i > 0 ? i - 1 : i; setPreviewImage(previewImages.current[n]); return n; });
      else if (e.key === 'ArrowRight') setPreviewIdx(i => { const n = i < previewImages.current.length - 1 ? i + 1 : i; setPreviewImage(previewImages.current[n]); return n; });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewImage]);

  // Fetch single page from server with current filters (server-side pagination)
  // MUST be defined before the useEffect below that calls fetchPage(1)
  const fetchPage = useCallback(async (pageNum: number) => {
    const params = new URLSearchParams();
    params.set('_page', String(pageNum));
    params.set('_pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (filterStatus !== '全部') params.set('status', filterStatus);
    if (filterPriority !== '全部') params.set('priority', filterPriority);
    if (filterCategory !== '全部') params.set('category', filterCategory);
    if (filterAssignee !== '全部') params.set('assignee', filterAssignee);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await apiFetch(`/api/requirements?${params}`);
    const data = await res.json();
    if (data && data.items) {
      setRequirements(data.items);
      setTotalCount(data.total);
      setCurrentPage(pageNum);
      if (data.counts) setAllStatusCounts(data.counts);
      if (data.moduleCounts) setModuleCounts(data.moduleCounts);
    } else if (Array.isArray(data)) {
      // Fallback for old API (array) format
      setRequirements(data);
      setTotalCount(data.length);
      setCurrentPage(1);
    }
  }, [search, filterStatus, filterPriority, filterCategory, filterAssignee, dateFrom, dateTo, pageSize]);

  // Initial load + subscribe to changes
  useEffect(() => {
    fetchPage(1);
    fetchModules();
    const api = (window as any).electronAPI;
    const unsub = api?.onRequirementsChanged?.(() => fetchPage(1));
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger re-fetch on filter change (reset to page 1)
  useEffect(() => {
    setCurrentPage(1);
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterStatus, filterPriority, filterCategory, filterAssignee, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const fetchModules = useCallback(() => {
    apiFetch('/api/requirement_modules').then(r => r.json()).then((list: any[]) => {
      setModuleList(Array.isArray(list) ? list.map((m: any) => ({ id: m.id, name: m.name })) : []);
    }).catch(() => {});
  }, []);

  const handleAddModule = async () => {
    setShowModuleModal({ name: '' });
  };

  const handleSaveModule = async () => {
    if (!showModuleModal || !showModuleModal.name.trim()) return;
    try {
      if (showModuleModal.id) {
        await apiFetch(`/api/requirement_modules/${showModuleModal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: showModuleModal.name.trim() }) });
        toast.success('模块已更新');
      } else {
        await apiFetch('/api/requirement_modules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: showModuleModal.name.trim() }) });
        toast.success('模块已添加');
      }
      fetchModules();
      setShowModuleModal(null);
    } catch { toast.error('操作失败'); }
  };

  const handleDeleteModuleConfirm = async () => {
    if (!moduleDeleteTarget) return;
    try {
      await apiFetch(`/api/requirement_modules/${moduleDeleteTarget.id}`, { method: 'DELETE' });
      fetchModules();
      toast.success('模块已删除');
    } catch { toast.error('删除失败'); }
    setModuleDeleteTarget(null);
  };

  const detailReq = detailReqId ? requirements.find(r => r.id === detailReqId) : null;
  // Load full contentBlocks on demand when listing excluded them
  const [detailBlocks, setDetailBlocks] = useState<ContentBlock[] | undefined>(undefined);
  useEffect(() => {
    if (viewType?.startsWith('requirements-') && detailReqId && !detailReq?.contentBlocks) {
      apiFetch(`/api/requirements/${detailReqId}`).then(r => {
        setDetailBlocks(r.data?.contentBlocks);
      }).catch(() => {});
    }
  }, [viewType, detailReqId, detailReq?.contentBlocks]);

  // Status bar — uses counts from API (unfiltered, always total)
  const statusStats = useMemo(() => {
    const totalAll = Object.values(allStatusCounts).reduce((a, b) => a + b, 0);
    return [
      { label: `全部`, count: totalAll, color: `var(--wiki-text)`, status: `全部` },
      { label: `待评估`, count: allStatusCounts['待评估'] || 0, color: statusConfig['待评估']?.color || '#f59e0b', status: `待评估` },
      { label: `设计中`, count: allStatusCounts['设计中'] || 0, color: statusConfig['设计中']?.color || '#6366f1', status: `设计中` },
      { label: `实现中`, count: allStatusCounts['实现中'] || 0, color: statusConfig['实现中']?.color || '#06b6d4', status: `实现中` },
      { label: `测试中`, count: allStatusCounts['测试中'] || 0, color: statusConfig['测试中']?.color || '#8b5cf6', status: `测试中` },
      { label: `已完成`, count: allStatusCounts['已完成'] || 0, color: statusConfig['已完成']?.color || '#10b981', status: `已完成` },
    ];
  }, [allStatusCounts]);

  // Open detail — always use local view to stay in the same page context
  const openDetail = useCallback((req: Requirement) => {
    setDetailBlocks(req.contentBlocks);
    setLocalReqId(req.id);
    setLocalView('requirements-detail');
  }, []);

  const openCreate = () => {
    if (onOpenSubTab) {
      onOpenSubTab?.('新建条目', 'requirements-create');
    } else {
      resetForm();
      setLocalReqId(null);
      setLocalView('requirements-create');
    }
  };

  // Status transition with remark modal
  const executeTransition = useCallback(async () => {
    if (!remarkModal || !detailReq) return;
    const { step, reqId } = remarkModal;
    const body: any = { title: detailReq.title, desc: detailReq.desc, module: detailReq.module, priority: detailReq.priority, status: step, assignee: detailReq.assignee, workflow_handler: detailReq.assignee, images: detailReq.images };
    const note = remarkText.trim();
    body.workflow_history = JSON.stringify([...(detailReq.workflowHistory || []), { from: detailReq.status, to: step, at: new Date().toISOString(), memo: note, handler: detailReq.assignee }]);
    try {
      await apiFetch(`/api/requirements/${reqId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setRequirements(prev => prev.map(r => r.id === reqId ? { ...r, status: step, workflowHistory: [...(r.workflowHistory || []), { from: r.status, to: step, handler: detailReq.assignee, time: new Date().toLocaleString('zh-CN') }] } : r));
      fetchPage(currentPage);
      toast.success(`已流转到「${step}」`);
    } catch { toast.error('流转失败'); }
    setRemarkModal(null);
    setRemarkText('');
  }, [remarkModal, remarkText, detailReq, currentPage, fetchPage]);

  const openEdit = useCallback((req: Requirement) => {
    setEditingReq(req);
    setForm({ title: req.title || '', desc: req.desc, module: req.module || '用户端', priority: req.priority, remark: '' });
    setImages(req.images || []);
    setDetailBlocks(req.contentBlocks);
    setLocalView('requirements-edit');
    setLocalReqId(req.id);
    setRemarkModal(null); // ensure edit doesn't trigger status flow
  }, []);

  // CRUD
  const handleCreate = async () => {
    if (!form.title.trim() && !form.desc.trim()) { toast.error('请输入标题或描述'); return; }
    const title = form.title.trim() || form.desc.substring(0, 30) || '新建条目';

    // Step 1: save
    let newId: number | null = null;
    try {
      const res = await apiFetch('/api/requirements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desc: form.desc, module: form.module, priority: form.priority, images, creator: user?.nickname || '' }),
      });
      // Use .data directly — avoids any .json() Promise resolution quirks
      const result = res.data;
      console.log('[handleCreate] POST result:', JSON.stringify(result).substring(0, 200));
      const extractedId = result?.id;
      if (!extractedId) { toast.error('创建失败 (id=' + extractedId + ')'); return; }
      newId = extractedId;
    } catch (e) { console.error('[handleCreate] save error', e); toast.error('创建失败'); return; }

    // Step 2: UI cleanup
    try { resetForm(); fetchPage(1); onCloseSelf?.(); toast.success('条目创建成功'); } catch {}

    // Step 3: auto-analyze (independent of UI cleanup)
    if (newId) {
      autoAnalyzeRef.current = setTimeout(async () => {
        try {
          console.log('[auto-analyze] start, newId=' + newId);
          const autoEnabled = (() => { try { return localStorage.getItem('ai_auto_analyze') !== 'false'; } catch { return true; } })();
          if (!autoEnabled) { console.log('[auto-analyze] disabled'); return; }
          const modelsRes = await apiFetch('/api/models');
          const models = modelsRes.data;
          if (Array.isArray(models) && models.some((m: any) => m.enabled)) {
            toast.success('正在 AI 分析...');
            const aRes = await apiFetch(`/api/requirements/${newId}/analyze`, { method: 'POST' });
            const aData = aRes.data;
            if (aData.error) toast.error(aData.error);
            else { fetchPage(1); toast.success('AI 分析完成'); }
          }
        } catch (e) { console.error('[auto-analyze] error', e); }
      }, 600);
    }
  };

  const handleUpdate = useCallback(() => {
    if (!editingReq) return;
    apiFetch(`/api/requirements/${editingReq.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title || editingReq.title, desc: form.desc, module: form.module, priority: form.priority, status: editingReq.status, images }),
    }).then(r => r.json()).then(() => {
      setEditingReq(null); resetForm(); fetchPage(currentPage);
      // Return to detail view (not close the tab)
      setLocalView('requirements-detail');
      toast.success('条目更新成功');
    });
  }, [editingReq, form, images, currentPage, fetchPage]);

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const [deleteLoading, setDeleteLoading] = useState(false);
  const confirmDelete = () => {
    if (confirmDeleteId === null) return;
    setDeleteLoading(true);
    apiFetch(`/api/requirements/${confirmDeleteId}`, { method: 'DELETE' }).then(() => {
      onCloseSelf?.();
      fetchPage(1); toast.success('已删除');
      setConfirmDeleteId(null);
    }).catch(() => {
      toast.error('删除失败，请重试');
    }).finally(() => {
      setDeleteLoading(false);
    });
  };

  const resetForm = () => { setForm({ title: '', desc: '', module: '用户端', priority: '无', remark: '' }); setImages([]); };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/requirements/upload-file', { method: 'POST', body: formData });
      const data = await res.json();
      setImages(prev => [...prev, data.url]);
      toast.success('上传成功');
    } catch {
      // Fallback: try legacy image endpoint
      try {
        const formData2 = new FormData();
        formData2.append('image', file);
        const res2 = await apiFetch('/api/requirements/upload-image', { method: 'POST', body: formData2 });
        const data2 = await res2.json();
        setImages(prev => [...prev, data2.url]);
        toast.success('上传成功');
      } catch { toast.error('上传失败'); }
    }
    finally { setUploading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) Array.from(e.target.files).forEach(f => uploadFile(f));
  };

  const removeImage = (url: string) => { setImages(prev => prev.filter(u => u !== url)); };

  const handleAnalyze = async (req: Requirement) => {
    setAnalyzing(true);
    try {
      const data = await (await apiFetch(`/api/requirements/${req.id}/analyze`, { method: 'POST' })).json();
      if (data.error) { toast.error(data.error); return; }
      setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, aiSummary: data.aiSummary, aiTags: data.aiTags || [], imageDescriptions: data.imageDescriptions } : r));
      toast.success('AI 分析完成');
    } catch { toast.error('AI 分析失败'); }
    finally { setAnalyzing(false); }
  };

  const formatDate = useCallback((dateStr: string) => {
    if (!dateStr) return '';
    try { return new Date(dateStr).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return dateStr; }
  }, []);

  // ---- List View ----
  if (viewType === 'requirements' || viewType === 'requirements-list') {
    const statusPills: FilterPill[] = statusStats.map(s => ({
      key: s.status,
      label: s.label,
      color: s.color,
      count: s.count,
    }));

    return (
      <>
        <DataPage
          sidebarOpen={moduleSidebarOpen}
          onToggleSidebar={() => setModuleSidebarOpen(prev => !prev)}
          sidebarTitle="模块分类"
          sidebarActions={
            <>
              <button onClick={handleAddModule}
                className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2 transition-colors" title="新增模块">
                <PlusIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
              </button>
              <button onClick={() => { const m = moduleList.find(ml => ml.name === filterCategory); if (m) setShowModuleModal({ id: m.id, name: m.name }); }}
                disabled={filterCategory === '全部'}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="编辑模块">
                <EditIcon size={11} style={{ color: 'var(--wiki-text3)' }} />
              </button>
              <button onClick={() => { const m = moduleList.find(ml => ml.name === filterCategory); if (m) setModuleDeleteTarget({ id: m.id, name: m.name }); }}
                disabled={filterCategory === '全部'}
                className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="删除模块">
                <TrashIcon size={11} style={{ color: 'var(--wiki-danger)' }} />
              </button>
            </>
          }
          sidebarItems={
            <>
              <SidebarItem
                label="全部"
                active={filterCategory === '全部'}
                count={totalCount}
                onClick={() => setFilterCategory('全部')}
              />
              {modules.map(m => {
                const isActive = filterCategory === m;
                return (
                  <SidebarItem
                    key={m}
                    label={m}
                    active={isActive}
                    count={moduleCounts[m]}
                    onClick={() => setFilterCategory(isActive ? '全部' : m)}
                  />
                );
              })}
            </>
          }
          title="采集库"
          description="管理和跟踪采集条目"
          headerActions={
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
              <PlusIcon size={16} /><span>新建条目</span>
            </button>
          }
          onSearchDebounced={setSearch}
          searchPlaceholder="搜索..."
          filterOpen={showFilter}
          onToggleFilter={() => setShowFilter(!showFilter)}
          filterPanel={showFilter && (
            <div className="mx-8 mb-4 p-4 rounded-lg flex-shrink-0" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">优先级</label>
                  <select className="px-3 py-2 rounded-md text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                    <option value="全部">全部</option>{priorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">负责人</label>
                  <input className="px-3 py-2 rounded-md text-xs text-wiki-text outline-none w-28" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }} placeholder="搜索..." value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">开始日期</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                    <CalendarIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                    <input type="date" className="bg-transparent text-xs text-wiki-text outline-none flex-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">截止日期</label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                    <CalendarIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                    <input type="date" className="bg-transparent text-xs text-wiki-text outline-none flex-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-end"><button onClick={() => { setFilterCategory('全部'); setFilterPriority('全部'); setFilterAssignee('全部'); setDateFrom(''); setDateTo(''); }} className="px-3 py-2 rounded-md text-xs" style={{ color: 'var(--wiki-text2)' }}>重置筛选</button></div>
              </div>
            </div>
          )}
          filterPills={statusPills}
          activePillKey={filterStatus}
          onPillChange={setFilterStatus}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isEmpty={requirements.length === 0}
          emptyTitle="暂无条目"
          emptyDescription="点击「新建条目」开始采集"
          page={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={fetchPage}
        >
          {requirements.map((req) => {
            if (viewMode === 'grid') {
              const statusCfg = statusConfig[req.status] || statusConfig['待评估'];
              const priorityCfg = priorityConfig[req.priority] || priorityConfig['中'];
              return (
                <div key={req.id} onClick={() => openDetail(req)}
                  className="p-4 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/40 hover:bg-wiki-surface2 transition-all duration-200"
                  style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={req.priority}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const p = e.target.value;
                          apiFetch(`/api/requirements/${req.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: p }) }).then(() => {
                            setRequirements(prev => prev.map(r => r.id === req.id ? { ...r, priority: p } : r));
                          });
                        }}
                        className="text-xs font-bold px-1.5 py-0.5 rounded appearance-none cursor-pointer outline-none"
                        style={{ background: priorityCfg.bg, color: priorityCfg.color, border: 'none' }}>
                        {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{ background: statusCfg.bg, color: statusCfg.color }}>
                      {req.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{req.title}</div>
                  <div className="text-xs text-wiki-text3 mb-3 line-clamp-2">{req.aiSummary || req.desc?.substring(0, 80) || '暂无描述'}</div>
                  <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--wiki-border)' }}>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{req.module}</span>
                    <span className="flex items-center gap-1 text-xs text-wiki-text3 ml-auto"><UserIcon size={10} />{req.creator}</span>
                    <span className="text-xs text-wiki-text3">{formatDate(req.createdAt)}</span>
                  </div>
                </div>
              );
            }
            return (
              <ReqListItem key={req.id} req={req} onOpen={openDetail} formatDate={formatDate}
                onPriorityChange={(reqId, p) => {
                  apiFetch(`/api/requirements/${reqId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority: p }) }).then(() => {
                    setRequirements(prev => prev.map(r => r.id === reqId ? { ...r, priority: p } : r));
                  });
                }} />
            );
          })}
        </DataPage>

        {/* Module Edit Modal */}
        {showModuleModal !== null && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }}>
            <div className="rounded-lg p-6" style={{ width: 'min(420px, 95vw)', background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-base font-semibold text-wiki-text">{showModuleModal.id ? '编辑模块' : '新增模块'}</span>
                <button onClick={() => setShowModuleModal(null)}><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>
              </div>
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">模块名称</label>
                <input
                  autoFocus
                  value={showModuleModal.name}
                  onChange={(e) => setShowModuleModal(prev => ({ ...prev!, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveModule(); if (e.key === 'Escape') setShowModuleModal(null); }}
                  className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none text-wiki-text outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}
                  placeholder="输入模块名称..."
                />
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button onClick={() => setShowModuleModal(null)} className="px-4 py-2 rounded-lg text-xs focus:outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
                <button onClick={handleSaveModule} className="px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
              </div>
            </div>
          </div>
        )}

        {/* Module Delete Confirm */}
        <ConfirmDialog
          open={moduleDeleteTarget !== null}
          title="确认删除"
          message={`确定要删除模块「${moduleDeleteTarget?.name}」？`}
          onConfirm={handleDeleteModuleConfirm}
          onCancel={() => setModuleDeleteTarget(null)}
        />

        {/* Confirm Delete Dialog */}
        <ConfirmDialog
          open={confirmDeleteId !== null}
          title="确认删除"
          message="确定要删除此条目？此操作不可撤销。"
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      </>
    );
  }

  // ---- Detail View (full page) ----
  if (viewType === 'requirements-detail' && detailReq) {
    return (
      <div data-cmp="RequirementsDetail" className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-8 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <button onClick={() => { setLocalView(null); setLocalReqId(null); }} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0" title="返回列表">
            <ChevronLeftIcon size={18} style={{ color: 'var(--wiki-text2)' }} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{detailReq.module}</span>
            <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ background: priorityConfig[detailReq.priority]?.bg, color: priorityConfig[detailReq.priority]?.color }}>{detailReq.priority}</span>
            <span className="text-base font-bold text-wiki-text truncate">{detailReq.title}</span>
          </div>
          <button onClick={() => handleAnalyze(detailReq)} disabled={analyzing} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0" title="AI分析" style={{ color: analyzing ? 'var(--wiki-text2)' : '#6366f1' }}>
            <SparklesIcon size={15} />
          </button>
          <button onClick={() => openEdit(detailReq)} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0" title="编辑">
            <EditIcon size={15} style={{ color: 'var(--wiki-text2)' }} />
          </button>
          <button onClick={() => handleDelete(detailReq.id)} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0" title="删除">
            <TrashIcon size={15} style={{ color: '#ef4444' }} />
          </button>
        </div>

        {/* Workflow status bar */}
        <div className="px-8 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-wiki-text3 flex-shrink-0 mr-1">流转:</span>
            {['待评估','设计中','实现中','测试中','已完成'].map((step, i) => {
              const so = ['待评估','设计中','实现中','测试中','已完成'];
              const ci = so.indexOf(detailReq.status);
              const done = i < ci; const cur = i === ci;
              return (
                <button key={step} onClick={() => {
                  if (done || cur || i > ci + 1) return;
                  setRemarkModal({ step, reqId: detailReq.id });
                  setRemarkText('');
                }}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors"
                  style={{
                    background: done ? '#10b98120' : cur ? 'var(--wiki-text)' : 'transparent',
                    color: done ? '#10b981' : cur ? 'var(--wiki-bg)' : i === ci + 1 ? 'var(--wiki-text2)' : 'var(--wiki-text3)',
                    cursor: i === ci + 1 ? 'pointer' : 'default',
                  }}>
                  {step}
                  {done && ' ✓'}
                </button>
              );
            })}
            {(() => {
              const so = ['待评估','设计中','实现中','测试中','已完成'];
              const ci = so.indexOf(detailReq.status);
              if (ci < so.length - 1) {
                const nextStep = so[ci + 1];
                return (
                  <button onClick={() => { setRemarkModal({ step: nextStep, reqId: detailReq.id }); setRemarkText(''); }}
                    className="ml-auto flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors hover:opacity-80"
                    style={{ background: statusConfig[nextStep]?.bg, color: statusConfig[nextStep]?.color }}>
                    <ChevronRightIcon size={13} />流转
                  </button>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Workflow history */}
        {(detailReq.workflowHistory?.length ?? 0) > 0 && (
          <WorkflowHistory history={detailReq.workflowHistory!} currentStatus={detailReq.status} />
        )}

        <div className="flex-1 overflow-y-auto px-8 py-4 scrollbar-thin">
          <div className="flex flex-col gap-4">
            {(detailReq.aiSummary || (detailReq.aiTags?.length > 0)) && (
              <div className="p-5 rounded-lg" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="flex items-center gap-2 mb-3"><SparklesIcon size={14} style={{ color: '#6366f1' }} /><span className="text-xs font-bold" style={{ color: '#6366f1' }}>AI 分析结果</span></div>
                {detailReq.aiSummary && <div className="text-sm leading-relaxed mb-3 font-medium" style={{ color: 'var(--wiki-text)' }}>{detailReq.aiSummary}</div>}
                {(detailReq.aiTags?.length > 0) && <div className="flex flex-wrap gap-1.5 mt-2">{(detailReq.aiTags || []).map((tag: string) => (<span key={tag} className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>#{tag}</span>))}</div>}
              </div>
            )}
            <div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
              <div className="text-xs text-wiki-text3 mb-2">描述</div>
              <MemoizedContentBlocks
                rawBlocks={detailBlocks ?? detailReq.contentBlocks}
                desc={detailReq.desc}
                images={detailReq.images}
              />
            </div>
          </div>
        </div>

        {previewImage && (<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => setPreviewImage(null)}>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">{previewIdx + 1} / {previewImages.current.length}</div>
          <button onClick={e => { e.stopPropagation(); setPreviewImage(null); }} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">×</button>
          {previewImages.current.length > 1 && <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => { const n = i > 0 ? i - 1 : i; setPreviewImage(previewImages.current[n]); return n; }); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronLeftIcon size={24} /></button>}
          {previewImages.current.length > 1 && <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => { const n = i < previewImages.current.length - 1 ? i + 1 : i; setPreviewImage(previewImages.current[n]); return n; }); }} className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronRightIcon size={24} /></button>}
          <img src={previewImage} className="max-w-[85vw] max-h-[85vh] rounded-md object-contain" onClick={e => e.stopPropagation()} />
        </div>)}

        {/* Status transition remark modal */}
        {remarkModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)' }} onClick={() => setRemarkModal(null)}>
            <div className="w-[380px] rounded-xl p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-wiki-text mb-3">流转到「{remarkModal.step}」</h3>
              <textarea value={remarkText} onChange={e => setRemarkText(e.target.value)} placeholder="输入备注（可选）..." rows={3}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setRemarkModal(null)} className="flex-1 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
                <button onClick={executeTransition} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>确认流转</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- Create/Edit Form (full page) ----
  return (
    <div data-cmp="RequirementsForm" className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-8 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={() => { if (viewType === 'requirements-edit') setLocalView('requirements-detail'); else onCloseSelf?.(); }} className="p-1 rounded hover:bg-wiki-surface2 transition-colors">
          <ChevronLeftIcon size={18} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <div className="flex-1 text-lg font-semibold text-wiki-text">{viewType === 'requirements-edit' ? '编辑条目' : '新建条目'}</div>
        <button onClick={viewType === 'requirements-edit' ? handleUpdate : handleCreate} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          {viewType === 'requirements-edit' ? '保存修改' : '提交'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-4 scrollbar-thin">
        <div className="flex flex-col gap-4">
          <div><input className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-wiki-text outline-none" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} placeholder="标题" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="flex gap-4">
            <div className="flex-1"><label className="text-xs text-wiki-text3 mb-2 block">模块</label><select className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} value={form.module} onChange={e => setForm({ ...form, module: e.target.value })}>{modules.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div className="flex-1"><label className="text-xs text-wiki-text3 mb-2 block">优先级</label><select className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{priorities.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          {images.length > 0 && (<div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}><div className="text-xs text-wiki-text3 mb-2">图片附件</div><div className="flex flex-wrap gap-2">{images.map((img, i) => (<div key={i} className="relative"><img src={img} className="w-20 h-20 rounded object-cover cursor-pointer hover:opacity-80" onClick={() => { previewImages.current = images; setPreviewIdx(i); setPreviewImage(img); }} /><button onClick={() => removeImage(img)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs">×</button></div>))}</div></div>)}
          <div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}><div className="text-xs text-wiki-text3 mb-2">描述</div><textarea className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none resize-none" style={{ background: 'transparent', border: 'none' }} rows={6} placeholder="详细描述内容..." value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} /></div>
          <div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}><div className="text-xs text-wiki-text3 mb-2">备注</div><textarea className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none resize-none" style={{ background: 'transparent', border: 'none' }} rows={3} placeholder="备注信息（可选）..." value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} /></div>
          <div><input type="file" ref={fileInputRef} accept="*/*" multiple className="hidden" onChange={handleFileSelect} /><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}><ImageIcon size={13} /> 添加附件</button></div>
        </div>
      </div>
      {previewImage && (<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.8)" }} onClick={() => setPreviewImage(null)}>
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">{previewIdx + 1} / {previewImages.current.length}</div>
        <button onClick={e => { e.stopPropagation(); setPreviewImage(null); }} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">×</button>
        {previewImages.current.length > 1 && <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => { const n = i > 0 ? i - 1 : i; setPreviewImage(previewImages.current[n]); return n; }); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronLeftIcon size={24} /></button>}
        {previewImages.current.length > 1 && <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => { const n = i < previewImages.current.length - 1 ? i + 1 : i; setPreviewImage(previewImages.current[n]); return n; }); }} className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronRightIcon size={24} /></button>}
        <img src={previewImage} className="max-w-[85vw] max-h-[85vh] rounded-md object-contain" onClick={e => e.stopPropagation()} />
      </div>)}
    </div>
  );
}

export default memo(Requirements);