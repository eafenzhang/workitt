import { apiFetch } from '../api';
import { useEffect, useState, useRef, useMemo, memo, useCallback } from 'react';
import { PlusIcon, SearchIcon, FilterIcon, SparklesIcon, CheckCircleIcon, AlertCircleIcon, UserIcon, CalendarIcon, XIcon, EditIcon, TrashIcon, ImageIcon, ChevronDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, FileTextIcon, FileIcon, ArchiveIcon, CodeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import type { ContentBlock } from '../types/content';
import ContentBlockRenderer from '../components/ContentBlockRenderer';
import { rebuildBlocksFromLegacy } from '../utils/contentBlocks';
import { DOC_EXTS, ARCHIVE_EXTS, CODE_EXTS, getFileExt, getFileCategory, formatFileSize } from '../components/FileChip';

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
  '高': { color: `#ef4444`, bg: `rgba(239,68,68,0.12)` },
  '中': { color: `#f59e0b`, bg: `rgba(245,158,11,0.12)` },
  '低': { color: `#10b981`, bg: `rgba(16,185,129,0.12)` },
};

const modules = ['系统后台', '机构后台', '品牌门店', '收银终端', '用户端', '开放平台'];
const priorities = ['高', '中', '低'];

// Memoized list item to avoid re-rendering all items on any state change
const ReqListItem = memo(function ReqListItem({
  req, onOpen, formatDate,
}: {
  req: Requirement;
  onOpen: (req: Requirement) => void;
  formatDate: (d: string) => string;
  onPriorityChange?: (req: Requirement, p: string) => void;
}) {
  const statusCfg = statusConfig[req.status] || statusConfig['待评估'];
  const priorityCfg = priorityConfig[req.priority] || priorityConfig['中'];
  const StatusIcon = statusCfg.icon;
  return (
    <div onClick={() => onOpen(req)}
      className="px-4 py-2.5 rounded-lg cursor-pointer transition-colors duration-150 group flex items-center gap-3"
      style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--wiki-surface2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--wiki-surface)'; }}>
      {/* Left: status icon — vertically centered */}
      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: statusCfg.bg }}>
        <StatusIcon size={13} style={{ color: statusCfg.color }} />
      </div>
      {/* Right: content */}
      <div className="flex-1 min-w-0">
        {/* Row 1: title + priority */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-wiki-text truncate flex-1">{req.title}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 cursor-pointer hover:opacity-80"
            style={{ background: priorityCfg.bg, color: priorityCfg.color }}
            onClick={e => { e.stopPropagation(); }}
            title="点击修改优先级">{req.priority}</span>
        </div>
        {/* Row 2: description | meta */}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-wiki-text3 line-clamp-1 flex-1">{req.aiSummary || req.desc?.substring(0, 80) || '暂无描述'}</span>
          <div className="flex items-center gap-2 text-xs text-wiki-text3 flex-shrink-0">
            <span className="flex items-center gap-0.5"><UserIcon size={10} />{req.creator}</span>
            <span className="flex items-center gap-0.5"><CalendarIcon size={10} />{formatDate(req.createdAt)}</span>
            <span>{req.module}</span>
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

function Requirements({ initialTab, onOpenSubTab, onCloseSelf }: Props) {
  const { user } = useAuth();
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
  // Internal view routing — allows edit to stay in same tab and return to detail
  const [localView, setLocalView] = useState<string | null>(null);
  const [localReqId, setLocalReqId] = useState<number | null>(null);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState({ desc: '', module: '用户端', priority: '中' });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const previewImages = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoAnalyzeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup auto-analyze timer on unmount
  useEffect(() => () => { if (autoAnalyzeRef.current) clearTimeout(autoAnalyzeRef.current); }, []);

  // Effective view: local state overrides initialTab prop (for internal edit→detail switching)
  const viewType = localView ?? (initialTab?.type || 'requirements');
  const detailReqId = localReqId ?? initialTab?.reqId;

  useEffect(() => {
    fetchRequirements();
    const api = (window as any).electronAPI;
    const unsub = api?.onRequirementsChanged?.(() => fetchRequirements());
    return () => { if (unsub) unsub(); };
  }, []);

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

  const fetchRequirements = useCallback(() => {
    apiFetch('/api/requirements').then(r => r.json()).then(data => setRequirements(data));
  }, []);

  const filteredRequirements = useMemo(() => requirements.filter(r => {
    if (search) { const s = search.toLowerCase(); if (!(r.title||'').toLowerCase().includes(s) && !(r.desc||'').toLowerCase().includes(s)) return false; }
    if (filterStatus !== '全部' && r.status !== filterStatus) return false;
    if (filterPriority !== '全部' && r.priority !== filterPriority) return false;
    if (filterCategory !== '全部' && r.category !== filterCategory) return false;
    if (filterAssignee !== '全部' && r.assignee !== filterAssignee) return false;
    if (dateFrom && (!r.createdAt || r.createdAt < dateFrom)) return false;
    if (dateTo && (!r.createdAt || r.createdAt > dateTo)) return false;
    return true;
  }), [requirements, search, filterStatus, filterPriority, filterCategory, filterAssignee, dateFrom, dateTo]);

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

  const statusStats = useMemo(() => {
    const counts: Record<string, number> = { '待评估': 0, '设计中': 0, '实现中': 0, '测试中': 0, '已完成': 0 };
    for (const r of requirements) { if (counts[r.status] !== undefined) counts[r.status]++; }
    return [
      { label: `全部`, count: requirements.length, color: `var(--wiki-text)`, status: `全部` },
      { label: `待评估`, count: counts['待评估'], color: statusConfig['待评估']?.color || '#f59e0b', status: `待评估` },
      { label: `设计中`, count: counts['设计中'], color: statusConfig['设计中']?.color || '#6366f1', status: `设计中` },
      { label: `实现中`, count: counts['实现中'], color: statusConfig['实现中']?.color || '#06b6d4', status: `实现中` },
      { label: `测试中`, count: counts['测试中'], color: statusConfig['测试中']?.color || '#8b5cf6', status: `测试中` },
      { label: `已完成`, count: counts['已完成'], color: statusConfig['已完成']?.color || '#10b981', status: `已完成` },
    ];
  }, [requirements]);

  // Open detail in parent tab
  const openDetail = useCallback((req: Requirement) => {
    onOpenSubTab?.(req.aiSummary || req.title?.substring(0, 20) || '需求详情', 'requirements-detail', { reqId: req.id });
  }, [onOpenSubTab]);

  const openCreate = () => {
    onOpenSubTab?.('新建需求', 'requirements-create');
  };

  const openEdit = useCallback((req: Requirement) => {
    setEditingReq(req);
    setForm({ desc: req.desc, module: req.module || '用户端', priority: req.priority });
    setImages(req.images || []);
    setDetailBlocks(req.contentBlocks);
    setLocalView('requirements-edit');
    setLocalReqId(req.id);
  }, []);

  // CRUD
  const handleCreate = async () => {
    console.log('[handleCreate] called, form.desc=', form.desc);
    if (!form.desc.trim()) { toast.error('请输入需求描述'); return; }
    const title = form.desc.substring(0, 30) || '新建需求';

    // Step 1: save
    let newId: number | null = null;
    try {
      const res = await apiFetch('/api/requirements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: form.desc, module: form.module, priority: form.priority, images, creator: user?.nickname || '' }),
      });
      // Use .data directly — avoids any .json() Promise resolution quirks
      const result = res.data;
      console.log('[handleCreate] POST result:', JSON.stringify(result).substring(0, 200));
      const extractedId = result?.id;
      if (!extractedId) { toast.error('创建失败 (id=' + extractedId + ')'); return; }
      newId = extractedId;
    } catch (e) { console.error('[handleCreate] save error', e); toast.error('创建失败'); return; }

    // Step 2: UI cleanup
    try { resetForm(); fetchRequirements(); onCloseSelf?.(); toast.success('需求创建成功'); } catch {}

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
            else { fetchRequirements(); toast.success('AI 分析完成'); }
          }
        } catch (e) { console.error('[auto-analyze] error', e); }
      }, 600);
    }
  };

  const handleUpdate = useCallback(() => {
    if (!editingReq) return;
    apiFetch(`/api/requirements/${editingReq.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editingReq.title, desc: form.desc, module: form.module, priority: form.priority, images }),
    }).then(r => r.json()).then(() => {
      setEditingReq(null); resetForm(); fetchRequirements();
      setLocalView('requirements-detail');
      toast.success('需求更新成功');
    });
  }, [editingReq, form, images, fetchRequirements]);

  const handleDelete = (id: number) => {
    if (!confirm('确定删除？')) return;
    apiFetch(`/api/requirements/${id}`, { method: 'DELETE' }).then(() => {
      onCloseSelf?.();
      fetchRequirements(); toast.success('已删除');
    });
  };

  const resetForm = () => { setForm({ desc: '', module: '用户端', priority: '中' }); setImages([]); };

  const uploadImage = async (file: File) => {
    setUploading(true); const formData = new FormData(); formData.append('image', file);
    try {
      const res = await apiFetch('/api/requirements/upload-image', { method: 'POST', body: formData });
      const data = await res.json(); setImages(prev => [...prev, data.url]);
      toast.success('图片上传成功');
    } catch { toast.error('图片上传失败'); }
    finally { setUploading(false); }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) Array.from(e.target.files).forEach(f => uploadImage(f));
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
    return (
      <div data-cmp="Requirements" className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4 px-8 pt-8">
          <div><h1 className="text-xl font-semibold text-wiki-text">采集库</h1><p className="text-wiki-text2 text-sm mt-1">管理和跟踪所有智能体需求条目</p></div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}><PlusIcon size={16} /><span>新建需求</span></button>
        </div>
        <div className="flex items-center gap-3 mb-4 px-8">
          <div className="flex items-center gap-2 flex-1 px-4 py-2 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <SearchIcon size={15} style={{ color: 'var(--wiki-text3)' }} />
            <input className="bg-transparent flex-1 text-xs outline-none text-wiki-text placeholder:text-wiki-text3" placeholder="搜索..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); }} className="text-wiki-text3 hover:text-wiki-text transition-colors"><XIcon size={14} /></button>}
          </div>
          <button onClick={() => setShowFilter(!showFilter)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: `var(--wiki-surface)`, border: `1px solid var(--wiki-border)`, color: `var(--wiki-text2)` }}>
            <FilterIcon size={14} /><span>筛选</span>
            <ChevronDownIcon size={12} style={{ transform: showFilter ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
        </div>
        {showFilter && (
          <div className="mx-8 mb-4 p-4 rounded-lg" style={{ background: `var(--wiki-surface)`, border: `1px solid var(--wiki-border)` }}>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">模块</label>
                <select className="px-3 py-2 rounded-md text-xs text-wiki-text outline-none" style={{ background: `var(--wiki-surface2)`, border: `1px solid var(--wiki-border)` }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="全部">全部</option>{modules.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">优先级</label>
                <select className="px-3 py-2 rounded-md text-xs text-wiki-text outline-none" style={{ background: `var(--wiki-surface2)`, border: `1px solid var(--wiki-border)` }} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                  <option value="全部">全部</option>{priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">负责人</label>
                <input className="px-3 py-2 rounded-md text-xs text-wiki-text outline-none w-28" style={{ background: `var(--wiki-surface2)`, border: `1px solid var(--wiki-border)` }} placeholder="搜索..." value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">开始日期</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: `var(--wiki-surface2)`, border: `1px solid var(--wiki-border)` }}>
                  <CalendarIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                  <input type="date" className="bg-transparent text-xs text-wiki-text outline-none flex-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1"><label className="text-xs text-wiki-text3">截止日期</label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md" style={{ background: `var(--wiki-surface2)`, border: `1px solid var(--wiki-border)` }}>
                  <CalendarIcon size={14} style={{ color: 'var(--wiki-text3)' }} />
                  <input type="date" className="bg-transparent text-xs text-wiki-text outline-none flex-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="flex items-end"><button onClick={() => { setFilterCategory('全部'); setFilterPriority('全部'); setFilterAssignee('全部'); setDateFrom(''); setDateTo(''); }} className="px-3 py-2 rounded-md text-xs" style={{ color: `var(--wiki-text2)` }}>重置筛选</button></div>
            </div>
          </div>
        )}
        <div className="flex gap-3 mb-4 px-8">
          {statusStats.map((stat) => (
            <div key={stat.label} onClick={() => setFilterStatus(stat.status === filterStatus ? '全部' : stat.status)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors"
              style={{
                background: filterStatus === stat.status ? stat.color : 'var(--wiki-surface)',
                color: filterStatus === stat.status ? '#fff' : 'var(--wiki-text3)',
                border: filterStatus === stat.status ? 'none' : '1px solid var(--wiki-border)',
              }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: filterStatus === stat.status ? '#fff' : stat.color }} />
              <span className="text-xs font-medium">{stat.label}</span>
              <span className="text-xs font-bold">{stat.count}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 overflow-y-auto flex-1 px-8 pb-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {filteredRequirements.map((req) => (
            <ReqListItem key={req.id} req={req} onOpen={openDetail} formatDate={formatDate} />
          ))}
        </div>
      </div>
    );
  }

  // ---- Detail View ----
  if (viewType === 'requirements-detail' && detailReq) {
    return (
      <div data-cmp="RequirementsDetail" className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-8 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-base font-bold text-wiki-text truncate">{detailReq.title}</div>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{detailReq.module}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: statusConfig[detailReq.status]?.bg, color: statusConfig[detailReq.status]?.color }}>{detailReq.status}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: priorityConfig[detailReq.priority]?.bg, color: priorityConfig[detailReq.priority]?.color }}>{detailReq.priority}</span>
            </div>
          </div>
          {/* Action buttons */}
          <button onClick={() => handleAnalyze(detailReq)} disabled={analyzing} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: analyzing ? 'var(--wiki-surface2)' : 'rgba(99,102,241,0.12)', color: analyzing ? 'var(--wiki-text2)' : '#6366f1' }}>
            <SparklesIcon size={13} /><span>{analyzing ? '分析中...' : 'AI分析'}</span>
          </button>
          <button onClick={() => openEdit(detailReq)} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
            <EditIcon size={13} /> 编辑
          </button>
          <button onClick={() => handleDelete(detailReq.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <TrashIcon size={13} /> 删除
          </button>
          <button onClick={onCloseSelf} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
            <ChevronLeftIcon size={14} /> 返回列表
          </button>
        </div>
        {/* Workflow — 流转 */}
        <div className="px-8 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-wiki-text3 flex-shrink-0">流转:</span>
            {['待评估','设计中','实现中','测试中','已完成'].map((step, i) => {
              const so = ['待评估','设计中','实现中','测试中','已完成'];
              const ci = so.indexOf(detailReq.status);
              const done = i < ci; const cur = i === ci;
              const statusCfg = statusConfig[step] || statusConfig['待评估'];
              const StepIcon = statusCfg.icon;
              return (
                <button key={step} onClick={async () => {
                  if (done || cur || i > ci + 1) return;
                  const memo = prompt(`流转到「${step}」\n请输入备注（可选）:`);
                  if (memo === null) return; // user cancelled
                  const body: any = { title: detailReq.title, desc: detailReq.desc, module: detailReq.module, priority: detailReq.priority, status: step, assignee: detailReq.assignee, workflow_handler: detailReq.assignee, images: detailReq.images };
                  if (memo) body.workflow_history = JSON.stringify([...(detailReq.workflowHistory || []), { from: detailReq.status, to: step, at: new Date().toISOString(), memo, handler: detailReq.assignee }]);
                  try {
                    await apiFetch(`/api/requirements/${detailReq.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                    // Update local state immediately for instant UI feedback
                    setRequirements(prev => prev.map(r =>
                      r.id === detailReq.id
                        ? { ...r, status: step, workflowHistory: [...(r.workflowHistory || []), { from: r.status, to: step, handler: detailReq.assignee, time: new Date().toLocaleString('zh-CN') }] }
                        : r
                    ));
                    fetchRequirements();
                    toast.success(`已流转到「${step}」`);
                  } catch { toast.error('流转失败'); }
                }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors"
                  style={{
                    background: done ? '#10b98120' : cur ? 'var(--wiki-text)' : 'transparent',
                    color: done ? '#10b981' : cur ? 'var(--wiki-bg)' : i === ci + 1 ? 'var(--wiki-text2)' : 'var(--wiki-text3)',
                    cursor: i === ci + 1 ? 'pointer' : 'default',
                  }}>
                  <StepIcon size={12} />
                  <span>{step}</span>
                  {done && <span className="text-[10px]">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-4 scrollbar-thin">
          <div className="flex flex-col gap-4">
            {(detailReq.aiSummary || (detailReq.aiTags?.length > 0)) && (
              <div className="p-5 rounded-lg" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="flex items-center gap-2 mb-3"><SparklesIcon size={14} style={{ color: '#6366f1' }} /><span className="text-xs font-bold" style={{ color: '#6366f1' }}>AI 分析结果</span></div>
                {detailReq.aiSummary && <div className="text-sm leading-relaxed mb-3 font-medium" style={{ color: 'var(--wiki-text)' }}>{detailReq.aiSummary}</div>}
                {(detailReq.aiTags?.length > 0) && <div className="flex flex-wrap gap-1.5 mt-2">{(detailReq.aiTags || []).map(tag => (<span key={tag} className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#6366f1' }}>#{tag}</span>))}</div>}
              </div>
            )}
            <div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
              <div className="text-xs text-wiki-text3 mb-2">需求描述</div>
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
      </div>
    );
  }

  // ---- Create/Edit Form ----
  return (
    <div data-cmp="RequirementsForm" className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-8 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
        <button onClick={() => { if (viewType === 'requirements-edit') setLocalView('requirements-detail'); else onCloseSelf?.(); }} className="p-1 rounded hover:bg-wiki-surface2 transition-colors">
          <ChevronLeftIcon size={18} style={{ color: 'var(--wiki-text2)' }} />
        </button>
        <div className="flex-1 text-lg font-semibold text-wiki-text">{viewType === 'requirements-edit' ? '编辑需求' : '新建需求'}</div>
        <button onClick={viewType === 'requirements-edit' ? handleUpdate : handleCreate} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
          {viewType === 'requirements-edit' ? '保存修改' : '提交需求'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-4 scrollbar-thin">
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1"><label className="text-xs text-wiki-text3 mb-2 block">模块</label><select className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} value={form.module} onChange={e => setForm({ ...form, module: e.target.value })}>{modules.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div className="flex-1"><label className="text-xs text-wiki-text3 mb-2 block">优先级</label><select className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{priorities.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
          </div>
          {images.length > 0 && (<div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}><div className="text-xs text-wiki-text3 mb-2">图片附件</div><div className="flex flex-wrap gap-2">{images.map((img, i) => (<div key={i} className="relative"><img src={img} className="w-20 h-20 rounded object-cover cursor-pointer hover:opacity-80" onClick={() => { previewImages.current = images; setPreviewIdx(i); setPreviewImage(img); }} /><button onClick={() => removeImage(img)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs">×</button></div>))}</div></div>)}
          <div className="p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}><div className="text-xs text-wiki-text3 mb-2">需求描述</div><textarea className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none resize-none" style={{ background: 'transparent', border: 'none' }} rows={6} placeholder="详细描述需求内容..." value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} /></div>
          <div><input type="file" ref={fileInputRef} accept="image/*" multiple className="hidden" onChange={handleImageSelect} /><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}><ImageIcon size={13} /> 添加图片附件</button></div>
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