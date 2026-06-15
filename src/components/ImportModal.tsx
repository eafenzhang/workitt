import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { XIcon, UploadIcon, FileTextIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../api';

/** Strip surrounding angle brackets from token-like strings (common paste error from docs like "<ghp_xxx>") */
function stripBracketTokens(env: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = typeof v === 'string' ? v.replace(/^<|>$/g, '') : v;
  }
  return out;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  apiPrefix: string;
  title: string;
  template: Record<string, any>[];
}

type ImportMode = 'file' | 'paste';

export default function ImportModal({ open, onClose, onImported, apiPrefix, title, template }: ImportModalProps) {
  const [mode, setMode] = useState<ImportMode>('file');
  const [jsonText, setJsonText] = useState('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<Record<string, any>[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; success: number; failed: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setJsonText('');
    setFileContent(null);
    setFileName(null);
    setParsedItems(null);
    setSelectedIndices(new Set());
    setImporting(false);
    setImportProgress(null);
    setParseError(null);
    setDragActive(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileContent(reader.result as string);
      setParseError(null);
      setParsedItems(null);
      setSelectedIndices(new Set());
    };
    reader.onerror = () => {
      setParseError('文件读取失败');
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setParseError('仅支持 .json 文件');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileContent(reader.result as string);
      setParseError(null);
      setParsedItems(null);
      setSelectedIndices(new Set());
    };
    reader.onerror = () => {
      setParseError('文件读取失败');
    };
    reader.readAsText(file);
  };

  const loadTemplate = () => {
    setJsonText(JSON.stringify(template, null, 2));
    setParseError(null);
    setParsedItems(null);
    setSelectedIndices(new Set());
  };

  const handleParse = () => {
    setParseError(null);
    const sourceText = mode === 'file' ? fileContent : jsonText;
    if (!sourceText || !sourceText.trim()) {
      setParseError('请先选择文件或输入 JSON 内容');
      return;
    }
    try {
      const parsed = JSON.parse(sourceText);
      let items: Record<string, any>[];

      // Detect {"mcpServers": {name: config, ...}} format (Claude Desktop / MCP standard)
      if (typeof parsed === 'object' && parsed !== null && parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        items = Object.entries(parsed.mcpServers).map(([name, config]) => {
          const cfg = typeof config === 'object' && config !== null ? config : {};
          return {
            name,
            type: cfg.type || 'stdio',
            command: cfg.command || '',
            args: cfg.args || [],
            env: stripBracketTokens(cfg.env || {}),
            config: cfg.config || {},
            description: cfg.description || `${name} MCP 服务`,
            source: 'import',
          };
        });
      } else if (Array.isArray(parsed)) {
        items = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Single object → auto-wrap as array
        items = [parsed];
      } else {
        setParseError('JSON 内容必须是数组、对象或 mcpServers 格式');
        return;
      }
      if (items.length === 0) {
        setParseError('数组不能为空');
        return;
      }
      setParsedItems(items);
      // Initially select all items
      setSelectedIndices(new Set(items.map((_, i) => i)));
    } catch (err: any) {
      setParseError(`JSON 解析失败: ${err.message}`);
    }
  };

  const toggleSelect = (index: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (!parsedItems) return;
    if (selectedIndices.size === parsedItems.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedItems.map((_, i) => i)));
    }
  };

  const handleImport = async () => {
    if (!parsedItems || selectedIndices.size === 0) return;
    setImporting(true);
    const toImport = parsedItems.filter((_, i) => selectedIndices.has(i));
    setImportProgress({ current: 0, total: toImport.length, success: 0, failed: 0 });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < toImport.length; i++) {
      try {
        // Remove id if present — backend generates new UUID
        const { id, ...itemData } = toImport[i];
        await apiFetch(apiPrefix, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(itemData),
        });
        success++;
      } catch {
        failed++;
      }
      setImportProgress({ current: i + 1, total: toImport.length, success, failed });
    }
    setImporting(false);
    toast.success(`导入完成: 成功 ${success} 项${failed > 0 ? `，失败 ${failed} 项` : ''}`);
    onImported();
    handleClose();
  };

  const hasDescription = parsedItems?.some(item => item.description !== undefined) ?? false;
  const hasSource = parsedItems?.some(item => item.source !== undefined) ?? false;
  const selectedCount = selectedIndices.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-[560px] max-h-[85vh] rounded-lg flex flex-col" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-lg font-semibold text-wiki-text">{title}</h2>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-wiki-surface2 transition-colors">
            <XIcon size={18} style={{ color: 'var(--wiki-text3)' }} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-1 px-6 pb-4">
          <button
            onClick={() => { setMode('file'); setParseError(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: mode === 'file' ? 'var(--wiki-surface2)' : 'transparent',
              color: mode === 'file' ? 'var(--wiki-text)' : 'var(--wiki-text3)',
              border: mode === 'file' ? '1px solid var(--wiki-border)' : '1px solid transparent',
            }}
          >
            <UploadIcon size={14} /> 文件上传
          </button>
          <button
            onClick={() => { setMode('paste'); setParseError(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: mode === 'paste' ? 'var(--wiki-surface2)' : 'transparent',
              color: mode === 'paste' ? 'var(--wiki-text)' : 'var(--wiki-text3)',
              border: mode === 'paste' ? '1px solid var(--wiki-border)' : '1px solid transparent',
            }}
          >
            <FileTextIcon size={14} /> 文本粘贴
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-6">
          {mode === 'file' ? (
            <div>
              {/* Drag & drop area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
                style={{
                  borderColor: dragActive ? 'var(--wiki-text)' : 'var(--wiki-border)',
                  background: dragActive ? 'var(--wiki-surface2)' : 'transparent',
                }}
              >
                <UploadIcon size={32} style={{ color: 'var(--wiki-text3)', margin: '0 auto' }} />
                <p className="mt-3 text-sm text-wiki-text2">
                  {fileName ? `已选择: ${fileName}` : '拖拽 JSON 文件到此处，或点击选择'}
                </p>
                <p className="mt-1 text-xs text-wiki-text3">仅支持 .json 格式</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              {fileContent && (
                <div className="mt-3 text-xs text-wiki-text3">
                  文件内容已加载 ({fileContent.length.toLocaleString()} 字符)
                </div>
              )}
            </div>
          ) : (
            <div>
              <textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setParseError(null); }}
                placeholder="在此粘贴 JSON 内容..."
                rows={12}
                className="w-full px-3 py-3 rounded-lg text-xs font-mono resize-y"
                style={{
                  background: 'var(--wiki-surface2)',
                  border: `1px solid ${parseError ? 'var(--wiki-danger)' : 'var(--wiki-border)'}`,
                  color: 'var(--wiki-text)',
                }}
              />
              <button
                onClick={loadTemplate}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)', border: '1px solid var(--wiki-border)' }}
              >
                <FileTextIcon size={12} /> 加载示例
              </button>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="mt-4 flex items-center gap-2 p-3 rounded-lg text-xs" style={{ background: 'var(--wiki-danger-bg)', color: 'var(--wiki-danger)' }}>
              <AlertCircleIcon size={14} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parse button */}
          {!parsedItems && (
            <button
              onClick={handleParse}
              disabled={importing}
              className="mt-4 w-full py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}
            >
              解析 JSON
            </button>
          )}

          {/* Preview Table */}
          {parsedItems && !importing && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-wiki-text2">
                  已解析 {parsedItems.length} 项
                </span>
                <button
                  onClick={toggleAll}
                  className="text-xs underline"
                  style={{ color: 'var(--wiki-text2)' }}
                >
                  {selectedIndices.size === parsedItems.length ? '取消全选' : '全选'}
                </button>
              </div>
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin rounded-lg" style={{ border: '1px solid var(--wiki-border)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--wiki-border)' }}>
                      <th className="w-10 px-3 py-2 text-left" style={{ color: 'var(--wiki-text3)' }}></th>
                      <th className="px-3 py-2 text-left" style={{ color: 'var(--wiki-text3)' }}>名称</th>
                      {hasDescription && <th className="px-3 py-2 text-left" style={{ color: 'var(--wiki-text3)' }}>描述</th>}
                      {hasSource && <th className="px-3 py-2 text-left" style={{ color: 'var(--wiki-text3)' }}>来源</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, i) => (
                      <tr
                        key={i}
                        className="hover:bg-wiki-surface2 cursor-pointer transition-colors"
                        style={{ borderBottom: i < parsedItems.length - 1 ? '1px solid var(--wiki-border)' : 'none' }}
                        onClick={() => toggleSelect(i)}
                      >
                        <td className="px-3 py-2.5">
                          <div
                            className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                            style={{
                              borderColor: selectedIndices.has(i) ? 'var(--wiki-text)' : 'var(--wiki-border)',
                              background: selectedIndices.has(i) ? 'var(--wiki-text)' : 'transparent',
                            }}
                          >
                            {selectedIndices.has(i) && (
                              <CheckCircleIcon size={10} style={{ color: 'var(--wiki-bg)' }} />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: 'var(--wiki-text)' }}>
                          {item.name || <span style={{ color: 'var(--wiki-text3)' }}>—</span>}
                        </td>
                        {hasDescription && (
                          <td className="px-3 py-2.5 max-w-[160px] truncate" style={{ color: 'var(--wiki-text2)' }}>
                            {item.description || <span style={{ color: 'var(--wiki-text3)' }}>—</span>}
                          </td>
                        )}
                        {hasSource && (
                          <td className="px-3 py-2.5" style={{ color: 'var(--wiki-text3)' }}>
                            {item.source || '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Progress */}
          {importing && importProgress && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-wiki-text2">
                  导入中... {importProgress.current}/{importProgress.total}
                </span>
                <span className="text-xs" style={{ color: 'var(--wiki-text3)' }}>
                  ✓ {importProgress.success}  ✗ {importProgress.failed}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--wiki-surface2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
                    background: importProgress.failed > 0 ? 'var(--wiki-danger)' : 'var(--wiki-success)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--wiki-border)' }}>
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-2 rounded-lg text-xs"
            style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}
          >
            取消
          </button>
          {parsedItems && !importing && (
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-4 py-2 rounded-lg text-xs font-medium"
              style={{
                background: selectedCount > 0 ? 'var(--wiki-text)' : 'var(--wiki-surface2)',
                color: selectedCount > 0 ? 'var(--wiki-bg)' : 'var(--wiki-text3)',
              }}
            >
              导入 {selectedCount} 项
            </button>
          )}
          {importing && (
            <button
              disabled
              className="px-4 py-2 rounded-lg text-xs font-medium"
              style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text3)' }}
            >
              导入中...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
