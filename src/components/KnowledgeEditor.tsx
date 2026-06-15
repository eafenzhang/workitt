/**
 * KnowledgeEditor — Lazy-loaded tiptap editor component.
 * Extracted from Knowledge.tsx for P1-05: tiptap (~392KB) is only loaded
 * when the user clicks "新建文档" or "编辑", not on initial page load.
 */
import { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import {
  BoldIcon, ItalicIcon, ListIcon, ClockIcon, Undo2Icon, Redo2Icon,
  ImagePlusIcon, Link2Icon, XIcon, PlusIcon,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Toast messages ──
const MESSAGES = {
  linkInserted: '链接已插入',
  imageInserted: '图片已插入',
  imageUploadFailed: '图片上传失败',
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

// ── Editor Toolbar ──
function EditorToolbar({
  editor,
  onImageUpload,
}: {
  editor: ReturnType<typeof useEditor>;
  onImageUpload: (file: File) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkInputValue, setLinkInputValue] = useState('');

  const handleInsertLink = () => {
    if (!linkInputValue) return;
    const url = linkInputValue.startsWith('http') ? linkInputValue : `https://${linkInputValue}`;
    editor?.chain().focus().setLink({ href: url }).run();
    setLinkInputValue('');
    if (linkInputRef.current) linkInputRef.current.style.display = 'none';
    toast.success(MESSAGES.linkInserted);
  };

  return (
    <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid var(--wiki-border)', background: 'var(--wiki-surface)' }}>
      <button onClick={() => editor?.chain().focus().toggleBold().run()} className={`p-2 rounded-md ${editor?.isActive('bold') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="粗体"><BoldIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={`p-2 rounded-md ${editor?.isActive('italic') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="斜体"><ItalicIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
      <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 1 }) ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="标题1"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H1</span></button>
      <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 2 }) ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="标题2"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H2</span></button>
      <button onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-2 rounded-md ${editor?.isActive('heading', { level: 3 }) ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="标题3"><span className="text-xs font-bold" style={{ color: 'var(--wiki-text)' }}>H3</span></button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
      <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`p-2 rounded-md ${editor?.isActive('bulletList') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="列表"><ListIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={`p-2 rounded-md ${editor?.isActive('orderedList') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="编号列表"><ClockIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
      <button onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={`p-2 rounded-md ${editor?.isActive('blockquote') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="引用"><span className="text-xs" style={{ color: 'var(--wiki-text)' }}>"</span></button>
      <button onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={`p-2 rounded-md ${editor?.isActive('codeBlock') ? 'bg-[var(--wiki-info-bg)]' : 'hover:bg-wiki-surface2 focus:outline-none'}`} title="代码块"><span className="text-xs font-mono" style={{ color: 'var(--wiki-text)' }}>&lt;&gt;</span></button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
      <button onClick={() => imageInputRef.current?.click()} className="p-2 rounded-md hover:bg-wiki-surface2 focus:outline-none" title="上传图片"><ImagePlusIcon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <button onClick={() => { const el = linkInputRef.current; if (el) { el.style.display = el.style.display === 'none' ? 'flex' : 'none'; el.style.alignItems = 'center'; el.style.gap = '4px'; } }} className="p-2 rounded-md hover:bg-wiki-surface2 focus:outline-none" title="插入链接"><Link2Icon size={14} style={{ color: 'var(--wiki-text)' }} /></button>
      <div className="w-px h-5 mx-1" style={{ background: 'var(--wiki-border)' }} />
      <button onClick={() => editor?.chain().focus().undo().run()} className="p-2 rounded-md hover:bg-wiki-surface2 focus:outline-none" title="撤销"><Undo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
      <button onClick={() => editor?.chain().focus().redo().run()} className="p-2 rounded-md hover:bg-wiki-surface2 focus:outline-none" title="重做"><Redo2Icon size={13} style={{ color: 'var(--wiki-text)' }} /></button>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { const url = await onImageUpload(file); if (url) editor?.chain().focus().setImage({ src: url, alt: file.name }).run(); } e.target.value = ''; }} />
      <div ref={linkInputRef} className="hidden ml-1">
        <input value={linkInputValue} onChange={(e) => setLinkInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleInsertLink(); if (e.key === 'Escape') { if (linkInputRef.current) linkInputRef.current.style.display = 'none'; setLinkInputValue(''); } }} placeholder="输入链接..." className="px-2 py-1 rounded text-xs w-48" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)', outline: 'none' }} />
        <button onClick={handleInsertLink} className="px-2 py-1 rounded text-xs" style={{ background: 'var(--wiki-accent)', color: 'var(--wiki-bg)' }}>插入</button>
      </div>
    </div>
  );
}

// ── Main Editor Component ──
interface KnowledgeEditorProps {
  showEdit: Partial<Document>;
  categoriesList: Category[];
  tabMode: boolean;
  onSave: () => Promise<any>;
  onClose: () => void;
  onImageUpload: (file: File) => Promise<string | null>;
  onChange: (data: Partial<Document>) => void;
}

export default function KnowledgeEditor({
  showEdit,
  categoriesList,
  tabMode,
  onSave,
  onClose,
  onImageUpload,
  onChange,
}: KnowledgeEditorProps) {
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
    content: showEdit.content || '',
    onUpdate: ({ editor: ed }) => {
      onChange({ ...showEdit, content: ed.getHTML() });
    },
    immediatelyRender: false,
  }, []);

  // Sync content when showEdit changes
  useEffect(() => {
    if (editor && showEdit) {
      const content = showEdit.content || '';
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, showEdit?.id, !!showEdit]);

  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const url = await onImageUpload(file);
          if (url) editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
        }
        return;
      }
    }
  };

  const handleDropImage = async (e: React.DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        const url = await onImageUpload(file);
        if (url) editor?.chain().focus().setImage({ src: url, alt: file.name }).run();
        return;
      }
    }
  };

  // Tab mode
  if (tabMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <select value={showEdit.category || 'guide'} onChange={(e) => onChange({ ...showEdit, category: e.target.value })} className="px-3 py-2 rounded-md text-xs focus:outline-none font-medium text-wiki-text outline-none cursor-pointer flex-shrink-0" style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', minWidth: '80px' }}>
            {categoriesList.slice(1).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <div className="flex-1">
            <input value={showEdit.title || ''} onChange={(e) => onChange({ ...showEdit, title: e.target.value })} placeholder="输入文档标题..." className="w-full text-lg font-semibold bg-transparent outline-none text-wiki-text placeholder:text-wiki-text3" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs focus:outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
            <button onClick={() => onSave().then(() => onClose())} className="px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
          </div>
        </div>
        <EditorToolbar editor={editor} onImageUpload={onImageUpload} />
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6" style={{ background: 'var(--wiki-bg)' }} onPaste={handlePasteImage} onDrop={handleDropImage} onDragOver={(e) => e.preventDefault()}>
          <div className="w-full">
            <EditorContent editor={editor} className="prose prose-lg max-w-none text-wiki-text [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror_p]:text-wiki-text [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-wiki-accent [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_code]:bg-wiki-surface2 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror img]:max-w-full [&_.ProseMirror_img]:cursor-pointer [&_.ProseMirror_a]:text-wiki-accent [&_.ProseMirror_a]:underline" />
          </div>
        </div>
      </div>
    );
  }

  // Non-tab (modal) mode
  return (
    <div className="fixed inset-0 z-50" style={{ background: 'var(--wiki-overlay)' }} onClick={onClose}>
      <div className="fixed inset-y-0 right-0 w-2/5 flex flex-col z-50" style={{ background: 'var(--wiki-surface)', borderLeft: '1px solid var(--wiki-border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        {/* Editor Header */}
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--wiki-border)' }}>
          <select
            value={showEdit.category || 'guide'}
            onChange={(e) => onChange({ ...showEdit, category: e.target.value })}
            className="px-3 py-2 rounded-md text-xs focus:outline-none font-medium text-wiki-text outline-none cursor-pointer flex-shrink-0"
            style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', minWidth: '80px' }}
          >
            {categoriesList.slice(1).map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <div className="flex-1">
            <input
              value={showEdit.title || ''}
              onChange={(e) => onChange({ ...showEdit, title: e.target.value })}
              placeholder="输入文档标题..."
              className="w-full text-lg font-semibold bg-transparent outline-none text-wiki-text placeholder:text-wiki-text3"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs focus:outline-none" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>取消</button>
            <button onClick={onSave} className="px-4 py-2 rounded-lg text-xs focus:outline-none font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
          </div>
        </div>

        {/* Toolbar */}
        <EditorToolbar editor={editor} onImageUpload={onImageUpload} />

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6" style={{ background: 'var(--wiki-bg)' }} onPaste={handlePasteImage} onDrop={handleDropImage} onDragOver={(e) => e.preventDefault()}>
          <div className="w-full">
            <EditorContent
              editor={editor}
              className="prose prose-lg max-w-none text-wiki-text [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] [&_.ProseMirror_p]:text-wiki-text [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-wiki-accent [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_code]:bg-wiki-surface2 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror img]:max-w-full [&_.ProseMirror_img]:cursor-pointer [&_.ProseMirror_a]:text-wiki-accent [&_.ProseMirror_a]:underline"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
