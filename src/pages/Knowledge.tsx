import { apiFetch, API } from '../api';
import { useEffect, useState, useRef } from 'react';
import { PlusIcon, FolderIcon, FileTextIcon, BookOpenIcon, LinkIcon, StarIcon, GridIcon, ListIcon, UploadIcon, EyeIcon, BookmarkIcon, XIcon, EditIcon, SparklesIcon, TrashIcon, CodeIcon, ImageIcon, GlobeIcon, MonitorIcon, FileIcon } from 'lucide-react';
import { toast } from 'sonner';
import KnowledgeEditor from '../components/KnowledgeEditor';
import DOMPurify from 'dompurify';
import DataPage, { type FilterPill } from '../components/DataPage';
import { SidebarItem } from '../components/UnifiedSidebar';
import DetailPanel from '../components/DetailPanel';
import ConfirmDialog from '../components/ConfirmDialog';

// ── Toast message constants ──
const MESSAGES = {
  linkInserted: '链接已插入',
  uploadSuccess: (name: string) => `上传成功: ${name}`,
  uploadFailed: (name: string) => `上传失败: ${name}`,
  deleted: '已删除',
  docUpdated: '文档已更新',
  docCreated: '文档已创建',
  categoryDeleted: '分类已删除',
  categoryUpdated: '分类已更新',
  categoryCreated: '分类已创建',
  aiAnalysisComplete: 'AI 分析完成',
  aiAnalysisFailed: 'AI 分析失败',
  imageInserted: '图片已插入',
  imageUploadFailed: '图片上传失败',
  deleteFailed: '删除失败',
  categoryNameRequired: '分类名称不能为空',
  createFailed: '创建失败',
  docLoadFailed: '文档加载失败',
  docListLoadFailed: '文档列表加载失败，请检查网络连接',
  docListLoadFailedSimple: '文档列表加载失败',
} as const;

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt?: string;
  _dbId?: string;
}

interface Document {
  id: number;
  title: string;
  category: string;
  type: string;
  size: string;
  views: number;
  stars: number;
  date: string;
  tags: string[];
  featured: boolean;
  content?: string;
  imageDescriptions?: string[];
  createdAt?: string;
  file_path?: string;
}

const defaultCategories: Category[] = [
  { id: 'all', name: '全部文档', icon: 'GridIcon', color: 'var(--wiki-accent3)' },
];

// Map category name to icon/color for dynamic categories from DB
const categoryMetaPresets: Record<string, { icon: string; color: string }> = {
  '指南': { icon: 'BookOpenIcon', color: 'var(--wiki-text)' },
  '参考': { icon: 'FileTextIcon', color: 'var(--wiki-info)' },
  '笔记': { icon: 'BookmarkIcon', color: 'var(--wiki-warning)' },
};

const typeIconMap: Record<string, any> = {
  PDF: FileTextIcon, MD: CodeIcon, HTML: GlobeIcon,
  DOC: FileTextIcon, DOCX: BookOpenIcon,
  XLS: GridIcon, XLSX: GridIcon, CSV: ListIcon,
  PPT: MonitorIcon, PPTX: MonitorIcon,
  ODT: FileTextIcon, ODS: GridIcon, ODP: MonitorIcon,
  RTF: FileTextIcon, TXT: FileIcon,
  JPG: ImageIcon, JPEG: ImageIcon, PNG: ImageIcon,
  GIF: ImageIcon, BMP: ImageIcon, WEBP: ImageIcon,
};

const typeColorMap: Record<string, { color: string; bg: string }> = {
  PDF: { color: `#ef4444`, bg: `rgba(239,68,68,0.12)` },
  MD: { color: `#10b981`, bg: `var(--wiki-surface2)` },
  HTML: { color: `#f59e0b`, bg: `rgba(245,158,11,0.12)` },
  DOC: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  DOCX: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  XLS: { color: `#22c55e`, bg: `rgba(34,197,94,0.12)` },
  XLSX: { color: `#22c55e`, bg: `rgba(34,197,94,0.12)` },
  CSV: { color: `#22c55e`, bg: `rgba(34,197,94,0.12)` },
  PPT: { color: `#f97316`, bg: `rgba(249,115,22,0.12)` },
  PPTX: { color: `#f97316`, bg: `rgba(249,115,22,0.12)` },
  ODT: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  ODS: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  ODP: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  RTF: { color: `var(--wiki-text)`, bg: `var(--wiki-surface2)` },
  TXT: { color: `#6b7280`, bg: `rgba(107,114,128,0.12)` },
  JPG: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
  JPEG: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
  PNG: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
  GIF: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
  BMP: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
  WEBP: { color: `#ec4899`, bg: `rgba(236,72,153,0.12)` },
};

const DocTypeIcon = ({ type, size, style }: { type: string; size: number; style?: React.CSSProperties }) => {
  const Icon = typeIconMap[type] || FileTextIcon;
  return <Icon size={size} strokeWidth={1.5} style={style} />;
};

interface KnowledgeProps {
  initialView?: string;
  docId?: number;
  onOpenSubTab?: (title: string, type: string, extra?: { docId?: number }) => void;
  onCloseSelf?: () => void;
}

// P1-05: EditorToolbar moved to KnowledgeEditor.tsx (lazy-loaded)

// P1-08: Extracted document detail header (was duplicated in tab & side-panel modes)
function DocDetailHeader({
  doc,
  onEdit,
  onClose,
  showEditButton,
}: {
  doc: Document;
  onEdit?: () => void;
  onClose: () => void;
  showEditButton?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-lg font-bold text-wiki-text truncate">{doc.title}</div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{doc.category}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: (typeColorMap[doc.type] || typeColorMap.MD).bg, color: (typeColorMap[doc.type] || typeColorMap.MD).color }}>{doc.type}</span>
          {doc.tags?.map((tag: string) => (<span key={tag} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}
          <span className="text-xs text-wiki-text3"><EyeIcon size={10} className="inline" /> {doc.views}</span>
          <span className="text-xs" style={{ color: 'var(--wiki-warning)' }}><StarIcon size={10} className="inline" /> {doc.stars}</span>
          <span className="text-xs text-wiki-text3">{doc.date}</span>
        </div>
      </div>
      {showEditButton && !doc.file_path && (
        <button onClick={onEdit} className="px-3 py-2 rounded-lg text-xs focus:outline-none flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}><EditIcon size={13} className="inline" /> 编辑</button>
      )}
      <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-wiki-surface2 focus:outline-none flex-shrink-0"><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>
    </div>
  );
}

// P1-08: Extracted file content viewer (was duplicated in tab & side-panel modes)
function FileContentViewer({
  doc,
  fileContent,
  previewHtml,
}: {
  doc: Document;
  fileContent: string | null;
  previewHtml: string | null;
}) {
  const isTextFile = (path: string) => /\.(txt|md|html?|js|ts|jsx|tsx|css|json|xml|yaml|yml|log|sh|bat|py|rb|php|java|c|cpp|h|hpp|sql|ini|cfg|conf)$/i.test(path);
  const isImageFile = (path: string) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(path);

  if (!doc.file_path) {
    return doc.content ? (
      <div className="prose prose-sm max-w-none text-wiki-text2 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_p]:leading-relaxed [&_ul]:list-disc [&_ol]:list-decimal [&_blockquote]:border-l-4 [&_blockquote]:border-wiki-accent [&_blockquote]:pl-4 [&_code]:bg-wiki-surface2 [&_code]:px-1 [&_code]:rounded text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(doc.content || '') }} />
    ) : null;
  }

  return (
    <div>
      {isImageFile(doc.file_path) ? (
        <img src={doc.file_path} alt={doc.title} className="max-w-full rounded-lg" loading="lazy" />
      ) : isTextFile(doc.file_path) && fileContent && fileContent !== '__loading__' ? (
        <pre className="text-sm text-wiki-text2 whitespace-pre-wrap">{fileContent}</pre>
      ) : isTextFile(doc.file_path) && fileContent === '__loading__' ? (
        <div className="flex items-center justify-center py-16 text-sm text-wiki-text3">加载中...</div>
      ) : isTextFile(doc.file_path) && fileContent === null ? (
        <div className="flex items-center justify-center py-16 text-sm" style={{ color: 'var(--wiki-danger)' }}>内容加载失败</div>
      ) : /\.pdf$/i.test(doc.file_path) ? (
        <iframe src={doc.file_path} className="w-full min-h-[700px] rounded-lg" style={{ border: '1px solid var(--wiki-border)' }} />
      ) : /\.(docx?|xlsx?|pptx?)$/i.test(doc.file_path) ? (
        previewHtml ? (
          <div className="prose prose-sm max-w-none text-wiki-text2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-wiki-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-wiki-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-wiki-surface2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml || '') }} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
            <FileTextIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
            <p className="mt-3 text-sm font-medium text-wiki-text">{doc.title}</p>
            <p className="mt-1 text-xs text-wiki-text3">{doc.type} · {doc.size}</p>
            <div className="mt-2 text-xs text-wiki-text3">正在加载预览...</div>
          </div>
        )
      ) : (
        <iframe src={doc.file_path} className="w-full min-h-[500px] rounded-lg" style={{ border: '1px solid var(--wiki-border)', background: '#fff' }} />
      )}
    </div>
  );
}

export default function Knowledge({ initialView, docId, onOpenSubTab, onCloseSelf }: KnowledgeProps) {
  const tabMode = !!onOpenSubTab;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  // 300ms debounce for search input
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showDoc, setShowDoc] = useState<Document | null>(null);
  const [showEdit, setShowEdit] = useState<Partial<Document> | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [categoriesList, setCategoriesList] = useState<Category[]>(defaultCategories);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [showCategoryEdit, setShowCategoryEdit] = useState<Partial<Category> | null>(null);
  const [docChangeKey, setDocChangeKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true); // collapsible sidebar
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // P1-05: Editor is now lazy-loaded via KnowledgeEditor component — no useEditor at top level

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (search) params.set('search', search);
    // P1-07: Add error handling with toast for document list fetch
    apiFetch(`${API.documents}?${params}`)
      .then(r => r.json())
      .then(data => setDocuments(data))
      .catch(() => toast.error(MESSAGES.docListLoadFailed));
  }, [activeCategory, search]);

  // Handle initial view from parent tab system
  useEffect(() => {
    if (!initialView || initialView === 'knowledge') return;
    if (initialView === 'knowledge-create') { setShowEdit({}); return; }
    // P1-07: Add error handling for doc detail loading
    const loadDoc = (doc: Document) => {
      apiFetch(API.documentsById(doc.id)).then(r => r.json()).then(setShowDoc).catch(() => toast.error(MESSAGES.docLoadFailed));
    };
    if (docId && (initialView === 'knowledge-detail' || initialView === 'knowledge-edit')) {
      apiFetch(API.documents).then(r => r.json()).then(data => {
        const doc = data.find((d: Document) => d.id === docId);
        if (doc) {
          if (initialView === 'knowledge-edit') setShowEdit(doc);
          else setShowDoc(doc);
        }
      }).catch(() => toast.error(MESSAGES.docListLoadFailedSimple));
    }
  }, [initialView, docId]);

  // Fetch category counts + actual storage stats
  useEffect(() => {
    apiFetch(API.documents)
      .then(r => r.json())
      .then(data => {
        const counts: Record<string, number> = {};
        data.forEach((d: Document) => { counts[d.category] = (counts[d.category] || 0) + 1; });
        setAllDocCounts(counts);
      });
  }, [docChangeKey]);

  const [allDocCounts, setAllDocCounts] = useState<Record<string, number>>({});

  // P1-14: Fetch categories from database API
  const fetchCategories = () => {
    apiFetch(API.knowledgeCategories)
      .then(r => r.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const dynamicCats: Category[] = data.map((c: any) => {
            const preset = categoryMetaPresets[c.name] || { icon: 'FolderIcon', color: 'var(--wiki-text)' };
            // Use category name as frontend id for document filtering compatibility
            return { id: c.name, name: c.name, icon: preset.icon, color: preset.color, createdAt: c.createdAt, _dbId: String(c.id) };
          });
          setCategoriesList([...defaultCategories, ...dynamicCats]);
        }
      })
      .catch(() => { /* silently fallback */ })
      .finally(() => setCategoriesLoading(false));
  };
  useEffect(() => { fetchCategories(); }, []);

  // P1-05: Editor content sync is now handled inside KnowledgeEditor component

  // Fetch uploaded file content for preview (text-based + HTML)
  const isTextFile = (path: string) => /\.(txt|md|html?|js|ts|jsx|tsx|css|json|xml|yaml|yml|log|sh|bat|py|rb|php|java|c|cpp|h|hpp|sql|ini|cfg|conf)$/i.test(path);
  const isImageFile = (path: string) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(path);
  const isOfficeFile = (path: string) => /\.(docx?|xlsx?|pptx?)$/i.test(path);

  useEffect(() => {
    let cancelled = false;
    if (showDoc?.file_path && isTextFile(showDoc.file_path)) {
      setFileContent('__loading__'); // show loading state
      apiFetch(showDoc.file_path)
        .then(r => r.text())
        .then(text => { if (!cancelled) setFileContent(text); })
        .catch(() => { if (!cancelled) setFileContent(null); });
    } else {
      setFileContent(null);
    }
    return () => { cancelled = true; };
  }, [showDoc?.id, showDoc?.file_path]);

  // Fetch Office file preview (converted to HTML on backend)
  useEffect(() => {
    if (showDoc?.id && showDoc.file_path && isOfficeFile(showDoc.file_path)) {
      apiFetch(API.documentsPreview(showDoc.id))
        .then(r => r.json())
        .then(data => setPreviewHtml(data.html || null))
        .catch(() => setPreviewHtml(null));
    } else {
      setPreviewHtml(null);
    }
  }, [showDoc?.id, showDoc?.file_path]);

  const fetchDocs = () => apiFetch(`${API.documents}?${new URLSearchParams(activeCategory !== 'all' ? { category: activeCategory } : {})}`).then(r => r.json()).then(data => { setDocuments(data); setDocChangeKey(k => k + 1); });

  // P1-02 & P1-05: Editor is now in lazy-loaded KnowledgeEditor.
  // Content is synced via onChange callback, so direct setShowEdit is safe.

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let hasSuccess = false;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await apiFetch(API.documentsUpload, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          const ext = file.name.split('.').pop()?.toUpperCase() || 'DOC';
          const docType = ['PDF','MD','HTML','DOC','DOCX','XLS','XLSX','CSV','PPT','PPTX','ODT','ODS','ODP','RTF','TXT','JPG','PNG','GIF','BMP','WEBP'].includes(ext) ? ext : 'DOC';
          await apiFetch(API.documents, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: file.name.replace(/\.[^.]+$/, ''),
              category: 'guide',
              type: docType,
              size: `${(file.size / 1024).toFixed(1)} KB`,
              date: new Date().toISOString().split('T')[0],
              tags: [],
              featured: false,
              content: `![${file.name}](${data.url})`,
              file_path: data.url,
            }),
          });
          toast.success(MESSAGES.uploadSuccess(file.name));
          hasSuccess = true;
        }
      } catch {
        toast.error(MESSAGES.uploadFailed(file.name));
      }
    }
    setUploading(false);
    if (hasSuccess) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocs();
    }
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (confirmDeleteId === null) return;
    apiFetch(API.documentsById(confirmDeleteId), { method: 'DELETE' }).then(() => { fetchDocs(); toast.success(MESSAGES.deleted); setConfirmDeleteId(null); });
  };

  const handleSaveEdit = (): Promise<any> => {
    if (!showEdit) return Promise.resolve();
    const payload = {
      ...showEdit,
      size: showEdit.size || `${String(showEdit.content || '').length} B`,
      date: showEdit.date || new Date().toISOString().split('T')[0],
    };
    const url = showEdit.id ? API.documentsById(showEdit.id) : API.documents;
    const method = showEdit.id ? 'PUT' : 'POST';
    return apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(r => r.json())
      .then((savedDoc) => {
        fetchDocs();
        setShowEdit(null);
        if (showEdit.id) {
          setShowDoc(savedDoc);
        }
        toast.success(showEdit.id ? MESSAGES.docUpdated : MESSAGES.docCreated);
      });
  };

  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteCategory = () => {
    if (activeCategory === 'all') return;
    const cat = categoriesList.find(c => c.id === activeCategory);
    if (!cat) return;
    setConfirmDeleteCategory({ id: cat._dbId || '', name: cat.name });
  };

  const confirmDeleteCategoryAction = () => {
    if (!confirmDeleteCategory) return;
    apiFetch(`${API.knowledgeCategories}/${confirmDeleteCategory.id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { toast.error(data.error); return; }
        toast.success(MESSAGES.categoryDeleted);
        setActiveCategory('all');
        fetchCategories();
      })
      .catch(() => toast.error(MESSAGES.deleteFailed))
      .finally(() => setConfirmDeleteCategory(null));
  };

  const handleSaveCategory = () => {
    if (!showCategoryEdit) return;
    const name = (showCategoryEdit.name || '').trim();
    if (!name) { toast.error(MESSAGES.categoryNameRequired); return; }
    apiFetch(API.knowledgeCategories, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) { toast.error(data.error); return; }
        toast.success(MESSAGES.categoryCreated);
        setShowCategoryEdit(null);
        fetchCategories();
      })
      .catch(() => toast.error(MESSAGES.createFailed));
  };

  const handleAISummary = () => {
    if (!showDoc?.id) return;
    setAnalyzing(true);
    apiFetch(API.documentsSummarize(showDoc.id), { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { toast.error(data.error); return; }
        if (data.summary) {
          setShowDoc(prev => prev ? { ...prev, content: (prev?.content || '') + '\n\n> **AI 总结**: ' + data.summary } : null);
        }
        if (data.imageDescriptions?.length > 0) {
          setShowDoc(prev => prev ? { ...prev, imageDescriptions: data.imageDescriptions } : null);
        }
        toast.success(MESSAGES.aiAnalysisComplete);
      })
      .catch(() => toast.error(MESSAGES.aiAnalysisFailed))
      .finally(() => setAnalyzing(false));
  };

  const handleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch(API.documentsUpload, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        toast.success(MESSAGES.imageInserted);
        return data.url;
      }
    } catch {
      toast.error(MESSAGES.imageUploadFailed);
    }
    return null;
  };

  // P1-05: handlePasteImage and handleDropImage moved into KnowledgeEditor component

  const featuredDocs = documents.filter(d => d.featured);
  const totalCount = Object.values(allDocCounts).reduce((a, b) => a + b, 0);

  // ---- Tab mode: inline document detail ----
  if (tabMode && initialView === 'knowledge-detail' && showDoc) {
    return (
      <div className="flex flex-col h-full">
        <DocDetailHeader
          doc={showDoc}
          onEdit={() => setShowEdit(showDoc)}
          onClose={onCloseSelf!}
          showEditButton={true}
        />
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {showDoc.imageDescriptions && showDoc.imageDescriptions.length > 0 && (
            <div className="mb-4 p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
              <div className="flex items-center gap-2 mb-2"><SparklesIcon size={12} style={{ color: 'var(--wiki-text)' }} /><span className="text-xs font-medium text-wiki-text">AI 图片识别</span></div>
              {showDoc.imageDescriptions.map((desc: string, i: number) => (<div key={i} className="text-xs text-wiki-text2 mb-1">· {desc}</div>))}
            </div>
          )}
          <FileContentViewer doc={showDoc} fileContent={fileContent} previewHtml={previewHtml} />
        </div>
        <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--wiki-border)' }}>
          <button onClick={handleAISummary} disabled={analyzing} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: analyzing ? 'var(--wiki-surface2)' : 'var(--wiki-text)', color: analyzing ? 'var(--wiki-text2)' : 'var(--wiki-bg)' }}>
            <SparklesIcon size={14} /><span>{analyzing ? '分析中...' : 'AI 总结'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ---- Tab mode: inline editor (P1-05: Lazy-loaded) ----
  if (tabMode && (initialView === 'knowledge-create' || initialView === 'knowledge-edit') && showEdit) {
    return (
        <KnowledgeEditor
          showEdit={showEdit}
          categoriesList={categoriesList}
          tabMode={true}
          onSave={handleSaveEdit}
          onClose={onCloseSelf || (() => {})}
          onImageUpload={handleImageUpload}
          onChange={(data) => setShowEdit(data)}
        />
    );
  }

  const categoryPills: FilterPill[] = [
    { key: 'all', label: '全部', color: 'var(--wiki-text)', count: totalCount },
    ...categoriesList.slice(1).map(c => ({
      key: c.id,
      label: c.name,
      color: c.color,
      count: allDocCounts[c.id] || 0,
    })),
  ];

  return (
    <>
      {/* Hidden file input for upload */}
      <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => { if (e.target.files) handleUpload(e.target.files); }} />

      <DataPage
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        sidebarTitle="分类目录"
        sidebarActions={
          <>
            <button onClick={() => setShowCategoryEdit({ name: '', icon: 'FolderIcon', color: 'var(--wiki-text)' })} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2 focus:outline-none transition-colors" title="新增分类">
              <PlusIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
            </button>
            <button onClick={() => { const cat = categoriesList.find(c => c.id === activeCategory); if (cat && cat.id !== 'all') setShowCategoryEdit(cat); }} disabled={activeCategory === 'all'} className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="编辑分类">
              <EditIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
            </button>
            <button onClick={handleDeleteCategory} disabled={activeCategory === 'all'} className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="删除分类">
              <TrashIcon size={12} style={{ color: 'var(--wiki-danger)' }} />
            </button>
          </>
        }
        sidebarItems={[{ ...categoriesList[0], count: totalCount }, ...categoriesList.slice(1).map(c => ({ ...c, count: allDocCounts[c.id] || 0 }))].map((cat) => {
          const iconMap: Record<string, any> = { GridIcon, FolderIcon, LinkIcon, BookOpenIcon, FileTextIcon, BookmarkIcon };
          const CatIcon = iconMap[cat.icon] || FolderIcon;
          return (
            <SidebarItem
              key={cat.id}
              label={cat.name}
              active={activeCategory === cat.id}
              count={cat.count}
              onClick={() => setActiveCategory(cat.id)}
              icon={<CatIcon size={14} style={{ color: activeCategory === cat.id ? cat.color : 'var(--wiki-text3)' }} />}
            />
          );
        })}
        title="知识库"
        description="管理文档、笔记和参考资料"
        headerActions={
          <>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
              <UploadIcon size={14} />上传文档
            </button>
            <button onClick={() => { if (onOpenSubTab) onOpenSubTab('新建文档','knowledge-create'); else setShowEdit({ category: 'guide', type: 'MD', size: '0 KB', date: new Date().toISOString().split('T')[0], tags: [], featured: false }); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-surface)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)' }}>
              <PlusIcon size={14} />新建文档
            </button>
          </>
        }
        onSearchDebounced={setSearch}
        searchPlaceholder="搜索文档、标签..."
        filterPills={categoryPills}
        activePillKey={activeCategory}
        onPillChange={setActiveCategory}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isEmpty={documents.length === 0}
        emptyTitle="暂无文档"
        emptyDescription="点击「上传文档」或「新建文档」开始"
      >
        {documents.map((doc) => {
          const typeCfg = typeColorMap[doc.type] || typeColorMap['MD'];
          if (viewMode === 'grid') {
            return (
              <div key={doc.id} onClick={() => { if (onOpenSubTab) onOpenSubTab(doc.title?.substring(0,20)||'文档','knowledge-detail',{docId:doc.id}); else apiFetch(API.documentsById(doc.id)).then(r=>r.json()).then(setShowDoc).catch(() => toast.error(MESSAGES.docLoadFailed)); }} className="p-4 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/40 hover:bg-wiki-surface2 transition-all duration-200" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}><DocTypeIcon type={doc.type} size={14} style={{ color: 'var(--wiki-text)' }} /></div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="text-xs px-2 py-0.5 rounded-lg font-medium" style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}>删除</button>
                </div>
                <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{doc.title}</div>
                <div className="flex flex-wrap gap-1 mb-3">{doc.tags.slice(0, 2).map((tag) => (<span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}</div>
                <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--wiki-border)' }}><span className="flex items-center gap-1 text-xs text-wiki-text3"><EyeIcon size={10} />{doc.views}</span><span className="flex items-center gap-1 text-xs" style={{ color: 'var(--wiki-warning)' }}><StarIcon size={10} />{doc.stars}</span><span className="text-xs text-wiki-text3 ml-auto">{doc.size}</span></div>
              </div>
            );
          } else {
            return (
              <div key={doc.id} onClick={() => { if (onOpenSubTab) onOpenSubTab(doc.title?.substring(0,20)||'文档','knowledge-detail',{docId:doc.id}); else apiFetch(API.documentsById(doc.id)).then(r=>r.json()).then(setShowDoc).catch(() => toast.error(MESSAGES.docLoadFailed)); }} className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 hover:border-[var(--wiki-info)]/30 hover:bg-wiki-surface2" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--wiki-surface2)' }}><DocTypeIcon type={doc.type} size={14} style={{ color: 'var(--wiki-text)' }} /></div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium text-wiki-text truncate">{doc.title}</div><div className="flex items-center gap-2 mt-0.5">{doc.tags.slice(0, 3).map((tag) => (<span key={tag} className="text-xs" style={{ color: 'var(--wiki-text3)' }}>{tag}</span>))}</div></div>
              <span className="text-xs px-2 py-0.5 rounded-lg font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{doc.type}</span>
              <span className="flex items-center gap-1 text-xs text-wiki-text3"><EyeIcon size={10} />{doc.views}</span>
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--wiki-warning)' }}><StarIcon size={10} />{doc.stars}</span>
              <span className="text-xs text-wiki-text3 w-16 text-right">{doc.size}</span>
              <span className="text-xs text-wiki-text3 w-24 text-right">{doc.date}</span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--wiki-danger-bg)' }}><TrashIcon size={12} style={{ color: 'var(--wiki-danger)' }} /></button>
            </div>
            );
          }
        })}
      </DataPage>

      {/* Document Detail Panel — unified slide-in from right */}
      <DetailPanel
        open={!!(showDoc && !showEdit && !tabMode)}
        onClose={() => setShowDoc(null)}
        header={<>
          {showDoc && (
            <>
              <div className="text-lg font-bold text-wiki-text truncate">{showDoc.title}</div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{showDoc.category}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: (typeColorMap[showDoc.type] || typeColorMap.MD).bg, color: (typeColorMap[showDoc.type] || typeColorMap.MD).color }}>{showDoc.type}</span>
                {showDoc.tags?.map((tag: string) => (<span key={tag} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}
                <span className="text-xs text-wiki-text3"><EyeIcon size={10} className="inline" /> {showDoc.views}</span>
                <span className="text-xs" style={{ color: 'var(--wiki-warning)' }}><StarIcon size={10} className="inline" /> {showDoc.stars}</span>
                <span className="text-xs text-wiki-text3">{showDoc.date}</span>
              </div>
              <div className="flex gap-2 mt-3">
                {!showDoc.file_path && (
                  <button onClick={() => setShowEdit(showDoc)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}><EditIcon size={12} className="inline" /> 编辑</button>
                )}
                <button onClick={() => { setConfirmDeleteId(showDoc.id); setShowDoc(null); }} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}><TrashIcon size={12} className="inline" /> 删除</button>
              </div>
            </>
          )}
        </>}
        footer={showDoc && (
          <button onClick={handleAISummary} disabled={analyzing} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: analyzing ? 'var(--wiki-surface2)' : 'var(--wiki-text)', color: analyzing ? 'var(--wiki-text2)' : 'var(--wiki-bg)' }}>
            <SparklesIcon size={14} /><span>{analyzing ? '分析中...' : 'AI 总结'}</span>
          </button>
        )}
      >
        {showDoc && (
          <>
            {showDoc.imageDescriptions && showDoc.imageDescriptions.length > 0 && (
              <div className="mb-4 p-4 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                <div className="flex items-center gap-2 mb-2"><SparklesIcon size={12} style={{ color: 'var(--wiki-text)' }} /><span className="text-xs font-medium text-wiki-text">AI 图片识别</span></div>
                {showDoc.imageDescriptions.map((desc: string, i: number) => (<div key={i} className="text-xs text-wiki-text2 mb-1">· {desc}</div>))}
              </div>
            )}
            <FileContentViewer doc={showDoc} fileContent={fileContent} previewHtml={previewHtml} />
          </>
        )}
      </DetailPanel>

      {/* Modal Editor (P1-05: Lazy-loaded) */}
      {showEdit && !tabMode && (
          <KnowledgeEditor
            showEdit={showEdit}
            categoriesList={categoriesList}
            tabMode={false}
            onSave={handleSaveEdit}
            onClose={() => setShowEdit(null)}
            onImageUpload={handleImageUpload}
            onChange={(data) => setShowEdit(data)}
          />
      )}


      {/* Category Edit Modal */}
      {showCategoryEdit !== null && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-lg p-6" style={{ width: 'min(520px, 95vw)', background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-semibold text-wiki-text">{showCategoryEdit.id ? '编辑分类' : '新增分类'}</span>
              <button onClick={() => setShowCategoryEdit(null)}><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">分类名称</label>
                <input value={showCategoryEdit.name || ''} onChange={(e) => setShowCategoryEdit(prev => ({ ...prev!, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs focus:outline-none text-wiki-text outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }} />
              </div>
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">图标</label>
                <div className="flex gap-2">
                  {[
                    { icon: 'FolderIcon', label: '文件夹', el: FolderIcon },
                    { icon: 'FileTextIcon', label: '文档', el: FileTextIcon },
                    { icon: 'LinkIcon', label: '链接', el: LinkIcon },
                    { icon: 'BookOpenIcon', label: '书籍', el: BookOpenIcon },
                    { icon: 'BookmarkIcon', label: '书签', el: BookmarkIcon },
                    { icon: 'GridIcon', label: '网格', el: GridIcon },
                  ].map(({ icon, label, el: IconComp }) => (
                    <button key={icon} onClick={() => setShowCategoryEdit(prev => ({ ...prev!, icon }))} className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all" style={{ background: showCategoryEdit.icon === icon ? 'var(--wiki-surface2)' : 'transparent', border: showCategoryEdit.icon === icon ? '1px solid var(--wiki-border)' : '1px solid transparent', width: 80 }}>
                      <IconComp size={20} style={{ color: showCategoryEdit.icon === icon ? showCategoryEdit.color || 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
                      <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">颜色</label>
                <div className="flex gap-2">
                  {['var(--wiki-text)', '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map(c => (
                    <button key={c} onClick={() => setShowCategoryEdit(prev => ({ ...prev!, color: c }))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: c === 'var(--wiki-text)' ? 'var(--wiki-surface2)' : c, border: showCategoryEdit.color === c ? '2px solid var(--wiki-text)' : '2px solid transparent' }}>
                      {showCategoryEdit.color === c && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowCategoryEdit(null)} className="px-4 py-2 rounded-lg text-xs focus:outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
              <button onClick={handleSaveCategory} className="px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="确认删除"
        message="确定要删除此文档？此操作不可撤销。"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
      {/* Confirm Delete Category Dialog */}
      <ConfirmDialog
        open={confirmDeleteCategory !== null}
        title="确认删除"
        message={`确定要删除分类「${confirmDeleteCategory?.name}」？`}
        onConfirm={confirmDeleteCategoryAction}
        onCancel={() => setConfirmDeleteCategory(null)}
      />
    </>
  );
}