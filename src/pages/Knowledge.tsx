import { apiFetch } from '../api';
import { useEffect, useState, useRef } from 'react';
import { SearchIcon, PlusIcon, FolderIcon, FileTextIcon, BookOpenIcon, LinkIcon, StarIcon, ClockIcon, GridIcon, ListIcon, UploadIcon, EyeIcon, BookmarkIcon, XIcon, EditIcon, SparklesIcon, TrashIcon, BoldIcon, ItalicIcon, ListIcon as ListIcon2, Undo2Icon, Redo2Icon, QuoteIcon, CodeIcon, ImageIcon, Link2Icon, ImagePlusIcon, GlobeIcon, MonitorIcon, FileIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
// P0-05: Import DOMPurify for XSS protection
import DOMPurify from 'dompurify';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
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
  { id: 'guide', name: '指南', icon: 'BookOpenIcon', color: 'var(--wiki-text)' },
  { id: 'reference', name: '参考', icon: 'FileTextIcon', color: '#6366f1' },
  { id: 'notes', name: '笔记', icon: 'BookmarkIcon', color: '#f59e0b' },
];

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
  const [categoriesList, setCategoriesList] = useState<Category[]>(() => {
    try {
      localStorage.setItem('wiki_categories', JSON.stringify(defaultCategories));
      return [...defaultCategories];
    } catch { return [...defaultCategories]; }
  });
  const [showCategoryEdit, setShowCategoryEdit] = useState<Partial<Category> | null>(null);
  const [docChangeKey, setDocChangeKey] = useState(0);
  // Lazy-init Tiptap editor: only create when editing/creating a document
  const isEditing = showEdit !== null;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
        },
      }),
      Placeholder.configure({ placeholder: '输入文档内容...' }),
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: showEdit?.content || '',
    onUpdate: ({ editor: ed }) => setShowEdit(prev => prev ? ({ ...prev, content: ed.getHTML() }) : prev),
    immediatelyRender: false,
  }, [isEditing]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkInputValue, setLinkInputValue] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (search) params.set('search', search);
    apiFetch(`/api/documents?${params}`)
      .then(r => r.json())
      .then(data => setDocuments(data));
  }, [activeCategory, search]);

  // Handle initial view from parent tab system
  useEffect(() => {
    if (!initialView || initialView === 'knowledge') return;
    if (initialView === 'knowledge-create') { setShowEdit({}); return; }
    if (docId && (initialView === 'knowledge-detail' || initialView === 'knowledge-edit')) {
      apiFetch('/api/documents').then(r => r.json()).then(data => {
        const doc = data.find((d: any) => d.id === docId);
        if (doc) {
          if (initialView === 'knowledge-edit') setShowEdit(doc);
          else setShowDoc(doc);
        }
      });
    }
  }, [initialView, docId]);

  // Fetch category counts + actual storage stats
  useEffect(() => {
    apiFetch('/api/documents')
      .then(r => r.json())
      .then(data => {
        const counts: Record<string, number> = {};
        data.forEach((d: Document) => { counts[d.category] = (counts[d.category] || 0) + 1; });
        setAllDocCounts(counts);
      });
    apiFetch('/api/storage/stats')
      .then(r => r.json())
      .then(s => { const usedGB = (s.usedBytes || 0) / (1024 * 1024 * 1024); setStorageStats({ usedBytes: usedGB, totalBytes: 1.0 }); })
      .catch(() => setStorageStats({ usedBytes: 0, totalBytes: 1.0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docChangeKey]);

  const [allDocCounts, setAllDocCounts] = useState<Record<string, number>>({});
  const [storageStats, setStorageStats] = useState({ usedBytes: 0, totalBytes: 0 });

  // Sync editor content when editing existing doc
  useEffect(() => {
    if (editor && showEdit?.id && showEdit.content !== undefined) {
      editor.commands.setContent(showEdit.content || '');
    }
  }, [showEdit?.id]);

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
      apiFetch(`/api/documents/${showDoc.id}/preview`)
        .then(r => r.json())
        .then(data => setPreviewHtml(data.html || null))
        .catch(() => setPreviewHtml(null));
    } else {
      setPreviewHtml(null);
    }
  }, [showDoc?.id, showDoc?.file_path]);

  const fetchDocs = () => apiFetch(`/api/documents?${new URLSearchParams(activeCategory !== 'all' ? { category: activeCategory } : {})}`).then(r => r.json()).then(data => { setDocuments(data); setDocChangeKey(k => k + 1); });

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          const ext = file.name.split('.').pop()?.toUpperCase() || 'DOC';
          const docType = ['PDF','MD','HTML','DOC','DOCX','XLS','XLSX','CSV','PPT','PPTX','ODT','ODS','ODP','RTF','TXT','JPG','PNG','GIF','BMP','WEBP'].includes(ext) ? ext : 'DOC';
          await apiFetch('/api/documents', {
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
          toast.success(`上传成功: ${file.name}`);
        }
      } catch {
        toast.error(`上传失败: ${file.name}`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchDocs();
  };

  const handleDelete = (id: number) => {
    if (!confirm('确定删除？')) return;
    apiFetch(`/api/documents/${id}`, { method: 'DELETE' }).then(() => { fetchDocs(); toast.success('已删除'); });
  };

  const handleSaveEdit = (): Promise<any> => {
    if (!showEdit) return Promise.resolve();
    const payload = {
      ...showEdit,
      size: showEdit.size || `${String(showEdit.content || '').length} B`,
      date: showEdit.date || new Date().toISOString().split('T')[0],
    };
    const url = showEdit.id ? `/api/documents/${showEdit.id}` : '/api/documents';
    const method = showEdit.id ? 'PUT' : 'POST';
    return apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(r => r.json())
      .then((savedDoc) => {
        fetchDocs();
        setShowEdit(null);
        if (showEdit.id) {
          setShowDoc(savedDoc);
        }
        toast.success(showEdit.id ? '文档已更新' : '文档已创建');
      });
  };

  const handleDeleteCategory = () => {
    if (activeCategory === 'all') return;
    if (!confirm(`确定删除分类"${categoriesList.find(c => c.id === activeCategory)?.name}"？`)) return;
    setCategoriesList(prev => { const next = prev.filter(c => c.id !== activeCategory); localStorage.setItem('wiki_categories', JSON.stringify(next)); return next; });
    setActiveCategory('all');
    toast.success('分类已删除');
  };

  const handleSaveCategory = () => {
    if (!showCategoryEdit) return;
    if (showCategoryEdit.id) {
      setCategoriesList(prev => { const next = prev.map(c => c.id === showCategoryEdit.id ? { ...c, ...showCategoryEdit } as Category : c); localStorage.setItem('wiki_categories', JSON.stringify(next)); return next; });
      toast.success('分类已更新');
    } else {
      const newCat = { ...showCategoryEdit, id: showCategoryEdit.name!.toLowerCase().replace(/\s+/g, '_') } as Category;
      setCategoriesList(prev => { const next = [...prev, newCat]; localStorage.setItem('wiki_categories', JSON.stringify(next)); return next; });
      toast.success('分类已创建');
    }
    setShowCategoryEdit(null);
  };

  const handleAISummary = () => {
    if (!showDoc?.id) return;
    setAnalyzing(true);
    apiFetch(`/api/documents/${showDoc.id}/summarize`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { toast.error(data.error); return; }
        if (data.summary) {
          setShowDoc(prev => prev ? { ...prev, content: (prev?.content || '') + '\n\n> **AI 总结**: ' + data.summary } : null);
        }
        if (data.imageDescriptions?.length > 0) {
          setShowDoc(prev => prev ? { ...prev, imageDescriptions: data.imageDescriptions } : null);
        }
        toast.success('AI 分析完成');
      })
      .catch(() => toast.error('AI 分析失败'))
      .finally(() => setAnalyzing(false));
  };

  const handleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/documents/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        editor?.chain().focus().setImage({ src: data.url, alt: file.name }).run();
        toast.success('图片已插入');
      }
    } catch {
      toast.error('图片上传失败');
    }
  };

  const handleInsertLink = () => {
    if (!linkInputValue) return;
    const url = linkInputValue.startsWith('http') ? linkInputValue : `https://${linkInputValue}`;
    editor?.chain().focus().setLink({ href: url }).run();
    setLinkInputValue('');
    if (linkInputRef.current) linkInputRef.current.style.display = 'none';
    toast.success('链接已插入');
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        return;
      }
    }
  };

  const handleDropImage = (e: React.DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        handleImageUpload(file);
        return;
      }
    }
  };

  const featuredDocs = documents.filter(d => d.featured);
  const totalCount = Object.values(allDocCounts).reduce((a, b) => a + b, 0);

  // ---- Tab mode: inline document detail ----
  if (tabMode && initialView === 'knowledge-detail' && showDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-wiki-text truncate">{showDoc.title}</div>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{showDoc.category}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: (typeColorMap[showDoc.type] || typeColorMap.MD).bg, color: (typeColorMap[showDoc.type] || typeColorMap.MD).color }}>{showDoc.type}</span>
              {showDoc.tags?.map((tag: string) => (<span key={tag} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}
              <span className="text-xs text-wiki-text3"><EyeIcon size={10} className="inline" /> {showDoc.views}</span>
              <span className="text-xs" style={{ color: '#f59e0b' }}><StarIcon size={10} className="inline" /> {showDoc.stars}</span>
              <span className="text-xs text-wiki-text3">{showDoc.date}</span>
            </div>
          </div>
          {!showDoc.file_path && (
            <button onClick={() => setShowEdit(showDoc)} className="px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}><EditIcon size={13} className="inline" /> 编辑</button>
          )}
          {onCloseSelf && <button onClick={onCloseSelf} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0"><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {showDoc.imageDescriptions && showDoc.imageDescriptions.length > 0 && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
              <div className="flex items-center gap-2 mb-2"><SparklesIcon size={12} style={{ color: 'var(--wiki-text)' }} /><span className="text-xs font-medium text-wiki-text">AI 图片识别</span></div>
              {showDoc.imageDescriptions.map((desc: string, i: number) => (<div key={i} className="text-xs text-wiki-text2 mb-1">· {desc}</div>))}
            </div>
          )}
          {showDoc.file_path ? (
            <div>
              {isImageFile(showDoc.file_path) ? (
                <img src={showDoc.file_path} alt={showDoc.title} className="max-w-full rounded-md" />
              ) : isTextFile(showDoc.file_path) && fileContent && fileContent !== '__loading__' ? (
                <pre className="text-sm text-wiki-text2 whitespace-pre-wrap">{fileContent}</pre>
              ) : isTextFile(showDoc.file_path) && fileContent === '__loading__' ? (
                <div className="flex items-center justify-center py-16 text-sm text-wiki-text3">加载中...</div>
              ) : isTextFile(showDoc.file_path) && fileContent === null ? (
                <div className="flex items-center justify-center py-16 text-sm" style={{ color: '#ef4444' }}>内容加载失败</div>
              ) : /\.pdf$/i.test(showDoc.file_path) ? (
                <iframe src={showDoc.file_path} className="w-full min-h-[700px] rounded-lg" style={{ border: '1px solid var(--wiki-border)' }} />
              ) : /\.(docx?|xlsx?|pptx?)$/i.test(showDoc.file_path) ? (
                previewHtml ? (
                  <div className="prose prose-sm max-w-none text-wiki-text2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-wiki-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-wiki-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-wiki-surface2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml || '') }} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                    <FileTextIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
                    <p className="mt-3 text-sm font-medium text-wiki-text">{showDoc.title}</p>
                    <p className="mt-1 text-xs text-wiki-text3">{showDoc.type} · {showDoc.size}</p>
                    <div className="mt-2 text-xs text-wiki-text3">正在加载预览...</div>
                  </div>
                )
              ) : (
                <iframe src={showDoc.file_path} className="w-full min-h-[500px] rounded-lg" style={{ border: '1px solid var(--wiki-border)', background: '#fff' }} />
              )}
            </div>
          ) : showDoc.content ? (
            <div className="prose prose-sm max-w-none text-wiki-text2 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_p]:leading-relaxed [&_ul]:list-disc [&_ol]:list-decimal [&_blockquote]:border-l-4 [&_blockquote]:border-wiki-accent [&_blockquote]:pl-4 [&_code]:bg-wiki-surface2 [&_code]:px-1 [&_code]:rounded text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(showDoc.content || '') }} />
          ) : null}
        </div>
        <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--wiki-border)' }}>
          <button onClick={handleAISummary} disabled={analyzing} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: analyzing ? 'var(--wiki-surface2)' : 'var(--wiki-text)', color: analyzing ? 'var(--wiki-text2)' : 'var(--wiki-bg)' }}>
            <SparklesIcon size={14} /><span>{analyzing ? '分析中...' : 'AI 总结'}</span>
          </button>
        </div>
      </div>
    );
  }

  // ---- Tab mode: inline editor ----
  if (tabMode && (initialView === 'knowledge-create' || initialView === 'knowledge-edit') && showEdit) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <select value={showEdit.category || 'guide'} onChange={(e) => setShowEdit(prev => ({ ...prev!, category: e.target.value }))} className="px-3 py-2 rounded-md text-xs font-medium text-wiki-text outline-none cursor-pointer flex-shrink-0" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', minWidth: '80px' }}>
            {categoriesList.slice(1).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <div className="flex-1">
            <input value={showEdit.title || ''} onChange={(e) => setShowEdit(prev => ({ ...prev!, title: e.target.value }))} placeholder="输入文档标题..." className="w-full text-lg font-semibold bg-transparent outline-none text-wiki-text placeholder:text-wiki-text3" />
          </div>
          <div className="flex items-center gap-2">
            {onCloseSelf && <button onClick={onCloseSelf} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>}
            <button onClick={() => handleSaveEdit().then(() => onCloseSelf?.())} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
          </div>
        </div>
        <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid var(--wiki-border)', background: 'var(--wiki-surface)' }}>
          <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-2 rounded-md ${editor?.isActive('bold') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="粗体"><BoldIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-2 rounded-md ${editor?.isActive('italic') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="斜体"><ItalicIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 1 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题1"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H1</span></button>
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 2 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题2"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H2</span></button>
          <button onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 3 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题3"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H3</span></button>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
          <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`p-2 rounded-md ${editor?.isActive('bulletList') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="列表"><ListIcon2 size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`p-2 rounded-md ${editor?.isActive('orderedList') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="编号列表"><ClockIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
          <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`p-2 rounded-md ${editor?.isActive('blockquote') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="引用"><span className="text-xs" style={{ color: 'var(--wiki-text)' }}>"</span></button>
          <button onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`p-2 rounded-md ${editor?.isActive('codeBlock') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="代码块"><span className="text-xs font-mono" style={{ color: 'var(--wiki-text)' }}>&lt;&gt;</span></button>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
          <button onClick={() => imageInputRef.current?.click()} className="p-2 rounded-md hover:bg-wiki-surface2" title="上传图片"><ImagePlusIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <button onClick={() => { const el = linkInputRef.current; if (el) { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; el.style.alignItems = 'center'; el.style.gap = '4px'; } }} className="p-2 rounded-md hover:bg-wiki-surface2" title="插入链接"><Link2Icon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
          <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
          <button onClick={() => editor?.chain().focus().undo().run()} className="p-2 rounded-md hover:bg-wiki-surface2" title="撤销"><Undo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
          <button onClick={() => editor?.chain().focus().redo().run()} className="p-2 rounded-md hover:bg-wiki-surface2" title="重做"><Redo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = ''; }} />
          <div ref={linkInputRef} className="hidden ml-1">
            <input value={linkInputValue} onChange={(e) => setLinkInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleInsertLink(); if (e.key === 'Escape') { if (linkInputRef.current) linkInputRef.current.style.display = 'none'; setLinkInputValue(''); } }} placeholder="输入链接..." className="px-2 py-1 rounded text-xs w-48" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)', outline: 'none' }} />
            <button onClick={handleInsertLink} className="px-2 py-1 rounded text-xs" style={{ background: 'var(--wiki-accent)', color: '#fff' }}>插入</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--wiki-bg)' }} onPaste={handlePasteImage} onDrop={handleDropImage} onDragOver={(e) => e.preventDefault()}>
          <div className="w-full">
            <EditorContent editor={editor} className="prose prose-lg max-w-none text-wiki-text [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror_p]:text-wiki-text [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-wiki-accent [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_code]:bg-wiki-surface2 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror img]:max-w-full [&_.ProseMirror_img]:cursor-pointer [&_.ProseMirror_a]:text-wiki-accent [&_.ProseMirror_a]:underline" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar */}
      <div className="flex flex-col w-[200px] min-w-[200px] p-5 overflow-hidden" style={{ borderRight: '1px solid var(--wiki-border)', background: 'var(--wiki-surface)' }}>
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs font-medium text-wiki-text3 uppercase tracking-wider">分类目录</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowCategoryEdit({ name: '', icon: 'FolderIcon', color: 'var(--wiki-text)' })} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-wiki-surface2 transition-colors" title="新增分类">
              <PlusIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
            </button>
            <button onClick={() => { const cat = categoriesList.find(c => c.id === activeCategory); if (cat && cat.id !== 'all') setShowCategoryEdit(cat); }} disabled={activeCategory === 'all'} className="w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="编辑分类">
              <EditIcon size={12} style={{ color: 'var(--wiki-text3)' }} />
            </button>
            <button onClick={handleDeleteCategory} disabled={activeCategory === 'all'} className="w-6 h-6 rounded-md flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-wiki-surface2" title="删除分类">
              <TrashIcon size={12} style={{ color: '#ef4444' }} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          {[{ ...categoriesList[0], count: totalCount }, ...categoriesList.slice(1).map(c => ({ ...c, count: allDocCounts[c.id] || 0 }))].map((cat) => {
            const isActive = activeCategory === cat.id;
            const iconMap: Record<string, any> = { GridIcon, FolderIcon, LinkIcon, BookOpenIcon, FileTextIcon, BookmarkIcon };
            const CatIcon = iconMap[cat.icon] || FolderIcon;
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200"
                style={{ background: isActive ? 'var(--wiki-surface2)' : 'transparent', border: isActive ? '1px solid var(--wiki-border)' : '1px solid transparent' }}>
                <CatIcon size={14} style={{ color: isActive ? cat.color : 'var(--wiki-text3)' }} />
                <span className="text-xs flex-1" style={{ color: isActive ? 'var(--wiki-text)' : 'var(--wiki-text2)' }}>{cat.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: isActive ? 'var(--wiki-surface2)' : 'var(--wiki-border)', color: isActive ? cat.color : 'var(--wiki-text3)' }}>{cat.count}</span>
              </button>
            );
          })}
        </div>

        {/* Fixed bottom section */}
        <div className="mt-4 flex-shrink-0">
          <div onClick={() => fileInputRef.current?.click()} className="p-4 rounded-lg flex flex-col items-center gap-2 cursor-pointer" style={{ border: '1px dashed var(--wiki-border)', background: 'var(--wiki-surface)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}>
              <UploadIcon size={14} style={{ color: 'var(--wiki-text)' }} />
            </div>
            <div className="text-center">
              <div className="text-xs font-medium text-wiki-text">上传文档</div>
              <div className="text-xs text-wiki-text3 mt-0.5">拖拽或点击上传</div>
            </div>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.odt,.ods,.odp,.rtf,.md,.html,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp" />

          <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--wiki-surface2)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-wiki-text3">存储空间</span>
              <span className="text-xs text-wiki-text">1.00 GB</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-wiki-text3">文件占用</span>
              <span className="text-xs text-wiki-text">{storageStats.usedBytes < 0.001 ? (storageStats.usedBytes * 1024).toFixed(1) + ' MB' : storageStats.usedBytes.toFixed(2) + ' GB'}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--wiki-border)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (storageStats.totalBytes > 0 ? (storageStats.usedBytes / storageStats.totalBytes) * 100 : 0))}%`, background: storageStats.usedBytes >= storageStats.totalBytes ? '#ef4444' : 'var(--wiki-text)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 p-6 overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-1 px-4 py-2 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <SearchIcon size={15} style={{ color: 'var(--wiki-text3)' }} />
            <input className="bg-transparent flex-1 text-xs outline-none text-wiki-text placeholder:text-wiki-text3" placeholder="搜索文档、标签..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <button onClick={() => setViewMode('grid')} className="w-7 h-7 rounded-md flex items-center justify-center transition-all" style={{ background: viewMode === 'grid' ? 'var(--wiki-surface2)' : 'transparent' }}>
              <GridIcon size={14} style={{ color: viewMode === 'grid' ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
            </button>
            <button onClick={() => setViewMode('list')} className="w-7 h-7 rounded-md flex items-center justify-center transition-all" style={{ background: viewMode === 'list' ? 'var(--wiki-surface2)' : 'transparent' }}>
              <ListIcon size={14} style={{ color: viewMode === 'list' ? 'var(--wiki-text)' : 'var(--wiki-text3)' }} />
            </button>
          </div>
            <button onClick={() => { if (onOpenSubTab) onOpenSubTab('新建文档','knowledge-create'); else setShowEdit({ category: 'guide', type: 'MD', size: '0 KB', date: new Date().toISOString().split('T')[0], tags: [], featured: false }); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
              <PlusIcon size={16} /><span>新建文档</span>
            </button>
        </div>

        {/* Featured */}
        {featuredDocs.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <StarIcon size={13} style={{ color: '#f59e0b' }} />
              <span className="text-xs font-medium text-wiki-text3 uppercase tracking-wider">精选推荐</span>
            </div>
            <div className="flex gap-3">
              {featuredDocs.map((doc) => {
                const typeCfg = typeColorMap[doc.type] || typeColorMap['MD'];
                return (
                  <div key={doc.id} onClick={() => { if (onOpenSubTab) onOpenSubTab(doc.title?.substring(0,20)||'文档','knowledge-detail',{docId:doc.id}); else apiFetch(`/api/documents/${doc.id}`).then(r=>r.json()).then(setShowDoc); }} className="flex-1 p-4 rounded-lg cursor-pointer hover:opacity-90 transition-opacity" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}><DocTypeIcon type={doc.type} size={14} style={{ color: 'var(--wiki-text)' }} /></div>
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{doc.type}</span>
                    </div>
                    <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{doc.title}</div>
                    <div className="flex items-center gap-3 mt-2"><span className="flex items-center gap-1 text-xs text-wiki-text3"><EyeIcon size={10} />{doc.views}</span><span className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}><StarIcon size={10} />{doc.stars}</span></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Document Grid / List */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-wiki-text3">共 {documents.length} 篇文档</span>
        </div>
        <div className={`overflow-y-auto scrollbar-thin ${viewMode === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3' : 'flex flex-col gap-2'}`}>
          {documents.map((doc) => {
            const typeCfg = typeColorMap[doc.type] || typeColorMap['MD'];
            if (viewMode === 'grid') {
              return (
                <div key={doc.id} onClick={() => { if (onOpenSubTab) onOpenSubTab(doc.title?.substring(0,20)||'文档','knowledge-detail',{docId:doc.id}); else apiFetch(`/api/documents/${doc.id}`).then(r=>r.json()).then(setShowDoc); }} className="p-4 rounded-lg cursor-pointer hover:border-indigo-500/40 transition-all duration-200" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--wiki-surface2)' }}><DocTypeIcon type={doc.type} size={14} style={{ color: 'var(--wiki-text)' }} /></div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>删除</button>
                  </div>
                  <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{doc.title}</div>
                  <div className="flex flex-wrap gap-1 mb-3">{doc.tags.slice(0, 2).map((tag) => (<span key={tag} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}</div>
                  <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--wiki-border)' }}><span className="flex items-center gap-1 text-xs text-wiki-text3"><EyeIcon size={10} />{doc.views}</span><span className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}><StarIcon size={10} />{doc.stars}</span><span className="text-xs text-wiki-text3 ml-auto">{doc.size}</span></div>
                </div>
              );
            } else {
              return (
                <div key={doc.id} onClick={() => { if (onOpenSubTab) onOpenSubTab(doc.title?.substring(0,20)||'文档','knowledge-detail',{docId:doc.id}); else apiFetch(`/api/documents/${doc.id}`).then(r=>r.json()).then(setShowDoc); }} className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 hover:border-indigo-500/30" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'var(--wiki-surface2)' }}><DocTypeIcon type={doc.type} size={14} style={{ color: 'var(--wiki-text)' }} /></div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium text-wiki-text truncate">{doc.title}</div><div className="flex items-center gap-2 mt-0.5">{doc.tags.slice(0, 3).map((tag) => (<span key={tag} className="text-xs" style={{ color: 'var(--wiki-text3)' }}>{tag}</span>))}</div></div>
                  <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: typeCfg.bg, color: typeCfg.color }}>{doc.type}</span>
                  <span className="flex items-center gap-1 text-xs text-wiki-text3"><EyeIcon size={10} />{doc.views}</span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}><StarIcon size={10} />{doc.stars}</span>
                  <span className="text-xs text-wiki-text3 w-16 text-right">{doc.size}</span>
                  <span className="text-xs text-wiki-text3 w-24 text-right">{doc.date}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}><TrashIcon size={12} style={{ color: '#ef4444' }} /></button>
                </div>
              );
            }
          })}
        </div>
      </div>

      {/* Document Detail Side Panel */}
      {(showDoc && !showEdit && !tabMode) && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowDoc(null)}>
          <div className="fixed inset-y-0 right-0 w-2/5 flex flex-col z-50" style={{ background: 'var(--wiki-surface)', borderLeft: '1px solid var(--wiki-border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold text-wiki-text truncate">{showDoc.title}</div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)' }}>{showDoc.category}</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: (typeColorMap[showDoc.type] || typeColorMap.MD).bg, color: (typeColorMap[showDoc.type] || typeColorMap.MD).color }}>{showDoc.type}</span>
                  {showDoc.tags?.map(tag => (<span key={tag} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>{tag}</span>))}
                  <span className="text-xs text-wiki-text3"><EyeIcon size={10} className="inline" /> {showDoc.views}</span>
                  <span className="text-xs" style={{ color: '#f59e0b' }}><StarIcon size={10} className="inline" /> {showDoc.stars}</span>
                  <span className="text-xs text-wiki-text3">{showDoc.date}</span>
                </div>
              </div>
              {!showDoc.file_path && (
                <button onClick={() => setShowEdit(showDoc)} className="px-3 py-2 rounded-md text-xs flex-shrink-0" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}><EditIcon size={13} className="inline" /> 编辑</button>
              )}
              <button onClick={() => setShowDoc(null)} className="p-1.5 rounded-md hover:bg-wiki-surface2 flex-shrink-0"><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
              {showDoc.imageDescriptions && showDoc.imageDescriptions.length > 0 && (
                <div className="mb-4 p-3 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                  <div className="flex items-center gap-2 mb-2"><SparklesIcon size={12} style={{ color: 'var(--wiki-text)' }} /><span className="text-xs font-medium text-wiki-text">AI 图片识别</span></div>
                  {showDoc.imageDescriptions.map((desc, i) => (<div key={i} className="text-xs text-wiki-text2 mb-1">· {desc}</div>))}
                </div>
              )}

              {showDoc.file_path ? (
                <div>
                  {isImageFile(showDoc.file_path) ? (
                    <img src={showDoc.file_path} alt={showDoc.title} className="max-w-full rounded-md" />
                  ) : isTextFile(showDoc.file_path) && fileContent && fileContent !== '__loading__' ? (
                    <pre className="text-sm text-wiki-text2 whitespace-pre-wrap">{fileContent}</pre>
                  ) : isTextFile(showDoc.file_path) && fileContent === '__loading__' ? (
                    <div className="flex items-center justify-center py-16 text-sm text-wiki-text3">加载中...</div>
                  ) : isTextFile(showDoc.file_path) && fileContent === null ? (
                    <div className="flex items-center justify-center py-16 text-sm" style={{ color: '#ef4444' }}>内容加载失败</div>
                  ) : /\.pdf$/i.test(showDoc.file_path) ? (
                    <iframe src={showDoc.file_path} className="w-full min-h-[700px] rounded-lg" style={{ border: '1px solid var(--wiki-border)' }} />
                  ) : /\.(docx?|xlsx?|pptx?)$/i.test(showDoc.file_path) ? (
                    previewHtml ? (
                      <div className="prose prose-sm max-w-none text-wiki-text2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-wiki-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-wiki-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-wiki-surface2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml || '') }} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 rounded-lg" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }}>
                        <FileTextIcon size={48} style={{ color: 'var(--wiki-text3)' }} />
                        <p className="mt-3 text-sm font-medium text-wiki-text">{showDoc.title}</p>
                        <p className="mt-1 text-xs text-wiki-text3">{showDoc.type} · {showDoc.size}</p>
                        <div className="mt-2 text-xs text-wiki-text3">正在加载预览...</div>
                      </div>
                    )
                  ) : (
                    <iframe src={showDoc.file_path} className="w-full min-h-[500px] rounded-lg" style={{ border: '1px solid var(--wiki-border)', background: '#fff' }} />
                  )}
                </div>
              ) : showDoc.content ? (
                <div className="prose prose-sm max-w-none text-wiki-text2 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_p]:leading-relaxed [&_ul]:list-disc [&_ol]:list-decimal [&_blockquote]:border-l-4 [&_blockquote]:border-wiki-accent [&_blockquote]:pl-4 [&_code]:bg-wiki-surface2 [&_code]:px-1 [&_code]:rounded text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(showDoc.content || '') }} />
              ) : null}
            </div>

            {/* Bottom Action */}
            <div className="px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--wiki-border)' }}>
              <button onClick={handleAISummary} disabled={analyzing} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: analyzing ? 'var(--wiki-surface2)' : 'var(--wiki-text)', color: analyzing ? 'var(--wiki-text2)' : 'var(--wiki-bg)' }}>
                <SparklesIcon size={14} /><span>{analyzing ? '分析中...' : 'AI 总结'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor */}
      {showEdit && !tabMode && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowEdit(null)}>
          <div className="fixed inset-y-0 right-0 w-2/5 flex flex-col z-50" style={{ background: 'var(--wiki-surface)', borderLeft: '1px solid var(--wiki-border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
          {/* Editor Header */}
          <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
            <select
              value={showEdit.category || 'guide'}
              onChange={(e) => setShowEdit(prev => ({ ...prev!, category: e.target.value }))}
              className="px-3 py-2 rounded-md text-xs font-medium text-wiki-text outline-none cursor-pointer flex-shrink-0"
              style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', minWidth: '80px' }}
            >
              {categoriesList.slice(1).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <div className="flex-1">
              <input
                value={showEdit.title || ''}
                onChange={(e) => setShowEdit(prev => ({ ...prev!, title: e.target.value }))}
                placeholder="输入文档标题..."
                className="w-full text-lg font-semibold bg-transparent outline-none text-wiki-text placeholder:text-wiki-text3"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowEdit(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid var(--wiki-border)', background: 'var(--wiki-surface)' }}>
            <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-2 rounded-md ${editor?.isActive('bold') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="粗体"><BoldIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-2 rounded-md ${editor?.isActive('italic') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="斜体"><ItalicIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 1 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题1"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H1</span></button>
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 2 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题2"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H2</span></button>
            <button onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 3 }) ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="标题3"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H3</span></button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
            <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`p-2 rounded-md ${editor?.isActive('bulletList') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="列表"><ListIcon2 size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`p-2 rounded-md ${editor?.isActive('orderedList') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="编号列表"><ClockIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
            <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`p-2 rounded-md ${editor?.isActive('blockquote') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="引用"><span className="text-xs" style={{ color: 'var(--wiki-text)' }}>"</span></button>
            <button onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`p-2 rounded-md ${editor?.isActive('codeBlock') ? 'bg-indigo-100' : 'hover:bg-wiki-surface2'}`} title="代码块"><span className="text-xs font-mono" style={{ color: 'var(--wiki-text)' }}>&lt;&gt;</span></button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
            <button onClick={() => imageInputRef.current?.click()} className="p-2 rounded-md hover:bg-wiki-surface2" title="上传图片"><ImagePlusIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <button onClick={() => { const el = linkInputRef.current; if (el) { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; el.style.alignItems = 'center'; el.style.gap = '4px'; } }} className="p-2 rounded-md hover:bg-wiki-surface2" title="插入链接"><Link2Icon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
            <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
            <button onClick={() => editor?.chain().focus().undo().run()} className="p-2 rounded-md hover:bg-wiki-surface2" title="撤销"><Undo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
            <button onClick={() => editor?.chain().focus().redo().run()} className="p-2 rounded-md hover:bg-wiki-surface2" title="重做"><Redo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
            {/* Hidden image input */}
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); e.target.value = ''; }} />
            {/* Inline link input */}
            <div ref={linkInputRef} className="hidden ml-1">
              <input
                value={linkInputValue}
                onChange={(e) => setLinkInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleInsertLink(); if (e.key === 'Escape') { if (linkInputRef.current) linkInputRef.current.style.display = 'none'; setLinkInputValue(''); } }}
                placeholder="输入链接..."
                className="px-2 py-1 rounded text-xs w-48"
                style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)', outline: 'none' }}
              />
              <button onClick={handleInsertLink} className="px-2 py-1 rounded text-xs" style={{ background: 'var(--wiki-accent)', color: '#fff' }}>插入</button>
            </div>
          </div>

          {/* Editor Content */}
          <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--wiki-bg)' }} onPaste={handlePasteImage} onDrop={handleDropImage} onDragOver={(e) => e.preventDefault()}>
            <div className="w-full">
              <EditorContent
                editor={editor}
                className="prose prose-lg max-w-none text-wiki-text [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror_p]:text-wiki-text [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-wiki-accent [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_code]:bg-wiki-surface2 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror img]:max-w-full [&_.ProseMirror_img]:cursor-pointer [&_.ProseMirror_a]:text-wiki-accent [&_.ProseMirror_a]:underline"
              />
            </div>
          </div>
        </div>
        </div>
      )}

      
      {/* Category Edit Modal */}
      {showCategoryEdit !== null && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-[520px] rounded-lg p-6" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-semibold text-wiki-text">{showCategoryEdit.id ? '编辑分类' : '新增分类'}</span>
              <button onClick={() => setShowCategoryEdit(null)}><XIcon size={18} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">分类名称</label>
                <input value={showCategoryEdit.name || ''} onChange={(e) => setShowCategoryEdit(prev => ({ ...prev!, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg text-xs text-wiki-text outline-none" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)' }} />
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
                      <span className="text-[10px]" style={{ color: 'var(--wiki-text3)' }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-wiki-text3 mb-1.5 block">颜色</label>
                <div className="flex gap-2">
                  {['var(--wiki-text)', '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'].map(c => (
                    <button key={c} onClick={() => setShowCategoryEdit(prev => ({ ...prev!, color: c }))} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: c === 'var(--wiki-text)' ? 'var(--wiki-surface2)' : c, border: showCategoryEdit.color === c ? '2px solid var(--wiki-text)' : '2px solid transparent' }}>
                      {showCategoryEdit.color === c && <span style={{ color: c === '#333333' || c === '#666666' || c === '#10b981' ? '#fff' : '#fff', fontSize: 12 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowCategoryEdit(null)} className="px-4 py-2 rounded-lg text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
              <button onClick={handleSaveCategory} className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}