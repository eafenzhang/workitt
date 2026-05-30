import { useState, useEffect } from 'react';

interface Props {
  dataUrl: string;   // base64 data URL
  fileName?: string;
}

type RenderState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'html'; html: string }
  | { status: 'sheet'; sheetNames: string[]; activeSheet: string; sheets: Record<string, string[][]> };

function getExt(name?: string): string {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.substring(idx).toLowerCase() : '';
}

function base64ToUint8(base64: string): Uint8Array {
  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function OfficePreview({ dataUrl, fileName }: Props) {
  const ext = getExt(fileName);
  const [state, setState] = useState<RenderState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const bytes = base64ToUint8(dataUrl);

        // DOCX
        if (ext === '.docx' || ext === '.doc') {
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(0) as ArrayBuffer });
          if (cancelled) return;
          setState({ status: 'html', html: result.value });
          return;
        }

        // XLSX / XLS
        if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(bytes, { type: 'array' });
          const sheetNames = wb.SheetNames;
          const sheets: Record<string, string[][]> = {};
          for (const name of sheetNames) {
            const sheet = wb.Sheets[name];
            sheets[name] = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
          }
          if (cancelled) return;
          setState({
            status: 'sheet',
            sheetNames,
            activeSheet: sheetNames[0] || '',
            sheets,
          });
          return;
        }

        // PPTX — extract text via mammoth (it supports .pptx too)
        if (ext === '.pptx' || ext === '.ppt') {
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(0) as ArrayBuffer });
          if (cancelled) return;
          if (result.value && result.value.trim()) {
            setState({ status: 'html', html: result.value });
          } else {
            setState({ status: 'error', message: '无法解析此 PPT 文件' });
          }
          return;
        }

        // PDF — already handled by iframe, but fallback
        if (ext === '.pdf') {
          setState({ status: 'error', message: 'PDF 请使用浏览器内置预览' });
          return;
        }

        setState({ status: 'error', message: `不支持的文件类型：${ext}` });
      } catch (e: any) {
        if (!cancelled) setState({ status: 'error', message: `渲染失败: ${e.message || '未知错误'}` });
      }
    }

    render();
    return () => { cancelled = true; };
  }, [dataUrl, ext]);

  // Loading
  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-sm">正在渲染...</div>
        </div>
      </div>
    );
  }

  // Error
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <div className="text-sm">{state.message}</div>
      </div>
    );
  }

  // HTML (DOCX / PPTX)
  if (state.status === 'html') {
    return (
      <div
        className="w-full h-full overflow-auto p-6"
        style={{ background: '#fff', color: '#1a1a1a', fontSize: '14px', lineHeight: '1.8' }}
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
    );
  }

  // Spreadsheet (XLSX / XLS)
  if (state.status === 'sheet') {
    return <SheetView state={state} onSheetChange={(name) => setState(s => s.status === 'sheet' ? { ...s, activeSheet: name } : s)} />;
  }

  return null;
}

// ── Sheet View ──────────────────────────────────────────────

function SheetView({ state, onSheetChange }: { state: Extract<RenderState, { status: 'sheet' }>; onSheetChange: (name: string) => void }) {
  const [frozenCols, setFrozenCols] = useState(0);
  const [frozenRows, setFrozenRows] = useState(1);
  const rows = state.sheets[state.activeSheet] || [];

  // Find data range
  const effectiveRows = rows.length;
  const effectiveCols = Math.max(...rows.map(r => r.length), 0);

  if (effectiveRows === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        该工作表为空
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f8f9fa' }}>
      {/* Sheet tabs */}
      {state.sheetNames.length > 1 && (
        <div className="flex gap-0 px-1 pt-1 overflow-x-auto flex-shrink-0" style={{ background: '#e8eaed' }}>
          {state.sheetNames.map(name => (
            <button
              key={name}
              onClick={() => onSheetChange(name)}
              className="px-4 py-1.5 text-xs font-medium rounded-t transition-colors border-0 outline-none"
              style={{
                background: name === state.activeSheet ? '#fff' : 'transparent',
                color: name === state.activeSheet ? '#1a73e8' : '#5f6368',
                marginRight: '1px',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto" style={{ background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', top: 0, left: 0, zIndex: 3,
                background: '#f1f3f4', border: '1px solid #dadce0',
                padding: '4px 8px', minWidth: '40px', textAlign: 'center', color: '#5f6368',
              }}>
                #
              </th>
              {Array.from({ length: effectiveCols }, (_, ci) => (
                <th key={ci} style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  background: '#f1f3f4', border: '1px solid #dadce0',
                  padding: '4px 8px', minWidth: '80px', color: '#5f6368', fontWeight: 500,
                }}>
                  {colLabel(ci)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f8f9fa' }}>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  background: ri % 2 === 0 ? '#fff' : '#f8f9fa',
                  border: '1px solid #dadce0', padding: '4px 8px',
                  textAlign: 'center', color: '#5f6368', fontSize: '11px',
                }}>
                  {ri + 1}
                </td>
                {Array.from({ length: effectiveCols }, (_, ci) => (
                  <td key={ci} style={{
                    border: '1px solid #dadce0', padding: '4px 8px',
                    maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: '#202124',
                  }}>
                    {/* eslint-disable-next-line @eslint-react-dom/no-dangerously-set-innerhtml */}
                    <span dangerouslySetInnerHTML={{ __html: formatCell(String(row[ci] ?? '')) }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {effectiveRows > 500 && (
          <div className="text-center py-3 text-xs text-gray-400">
            仅显示前 500 行（共 {effectiveRows} 行）
          </div>
        )}
      </div>
    </div>
  );
}

// Column letter: 0→A, 1→B, ..., 25→Z, 26→AA
function colLabel(idx: number): string {
  let s = '';
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Simple HTML formatting: newlines → <br>, URLs → links
function formatCell(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // Convert URLs to clickable links
  return escaped.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" target="_blank" style="color:#1a73e8;text-decoration:none">$1</a>'
  );
}
