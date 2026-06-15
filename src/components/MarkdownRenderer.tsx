import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/** Animated streaming skeleton shown while AI is responding */
export function StreamingCard() {
  return (
    <div className="flex justify-start w-full">
      <div className="max-w-[80%] min-w-[180px]">
        <div className="px-4 py-3 rounded-xl overflow-hidden relative"
          style={{
            background: 'var(--wiki-surface2)',
            borderBottomLeftRadius: '4px',
          }}>
          {/* Shimmer overlay */}
          <div className="absolute inset-0 animate-streaming-shimmer"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(128,128,128,0.06) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }} />
          {/* Typing dots */}
          <div className="flex items-center gap-1.5 relative z-10">
            {[0, 1, 2].map(i => (
              <span key={i}
                className="inline-block w-2 h-2 rounded-full animate-streaming-dot"
                style={{
                  background: 'var(--wiki-text3)',
                  animationDelay: `${i * 0.15}s`,
                }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Markdown content with fade-in animation */
const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body animate-markdown-in">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Override <pre> to match Workit design
          pre: ({ children, ...props }) => (
            <pre
              {...props}
              className="my-1.5 p-2.5 rounded-lg text-xs overflow-x-auto"
              style={{
                background: 'var(--wiki-bg)',
                border: '1px solid var(--wiki-border)',
                color: 'var(--wiki-text2)',
                lineHeight: 1.5,
              }}
            >
              {children}
            </pre>
          ),
          // Inline code
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  {...props}
                  className="px-1 py-0.5 rounded text-xs font-mono align-baseline"
                  style={{
                    background: 'var(--wiki-surface2)',
                    color: 'var(--wiki-text)',
                    border: '1px solid var(--wiki-border)',
                  }}
                >
                  {children}
                </code>
              );
            }
            return (
              <code {...props} className={className} style={{ background: 'transparent', fontSize: '12px', lineHeight: 1.5 }}>
                {children}
              </code>
            );
          },
          // Tables
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-1.5">
              <table
                {...props}
                className="text-xs border-collapse w-full"
                style={{ border: '1px solid var(--wiki-border)', lineHeight: 1.5 }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              {...props}
              className="px-3 py-1.5 text-left font-semibold"
              style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              {...props}
              className="px-3 py-1.5"
              style={{ border: '1px solid var(--wiki-border)', color: 'var(--wiki-text2)' }}
            >
              {children}
            </td>
          ),
          // Blockquote
          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="pl-2.5 my-1.5 italic"
              style={{ borderLeftWidth: '3px', borderLeftStyle: 'solid', borderColor: 'var(--wiki-text3)', color: 'var(--wiki-text2)', fontSize: '13px', lineHeight: 1.5 }}
            >
              {children}
            </blockquote>
          ),
          // Strikethrough / deleted text
          del: ({ children, ...props }) => (
            <del {...props} className="line-through" style={{ color: 'var(--wiki-text3)' }}>{children}</del>
          ),
          // Links
          a: ({ children, href, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
              style={{ color: 'var(--wiki-accent)', lineHeight: 1.5 }}
            >
              {children}
            </a>
          ),
          // Headings
          h1: ({ children, ...props }) => (
            <h1 {...props} className="text-base font-semibold mt-3 mb-1.5" style={{ color: 'var(--wiki-text)', lineHeight: 1.4 }}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="text-sm font-semibold mt-2.5 mb-1" style={{ color: 'var(--wiki-text)', lineHeight: 1.4 }}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="text-[13px] font-semibold mt-2 mb-1" style={{ color: 'var(--wiki-text)', lineHeight: 1.4 }}>{children}</h3>
          ),
          // Lists
          ul: ({ children, ...props }) => (
            <ul {...props} className="list-disc pl-5 my-1 space-y-0.5" style={{ color: 'var(--wiki-text2)', fontSize: '13px', lineHeight: 1.5 }}>{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="list-decimal pl-5 my-1 space-y-0.5" style={{ color: 'var(--wiki-text2)', fontSize: '13px', lineHeight: 1.5 }}>{children}</ol>
          ),
          // List items
          li: ({ children, ...props }) => (
            <li {...props} style={{ lineHeight: 1.5, fontSize: '13px' }}>{children}</li>
          ),
          // Paragraphs
          p: ({ children, ...props }) => (
            <p {...props} className="my-1 leading-snug" style={{ color: 'var(--wiki-text2)', fontSize: '13px' }}>{children}</p>
          ),
          // Horizontal rule
          hr: (props) => (
            <hr {...props} className="my-2" style={{ borderColor: 'var(--wiki-border)', opacity: 0.5 }} />
          ),
          // Strong / emphasis
          strong: ({ children, ...props }) => (
            <strong {...props} style={{ color: 'var(--wiki-text)', fontWeight: 600 }}>{children}</strong>
          ),
          em: ({ children, ...props }) => (
            <em {...props} className="italic" style={{ color: 'var(--wiki-text2)' }}>{children}</em>
          ),
          // GFM Task list checkbox
          input: ({ type, checked, disabled, ...props }) => {
            if (type === 'checkbox') {
              return (
                <span className="inline-flex items-center mr-1.5">
                  <input type="checkbox" checked={checked} disabled={disabled} readOnly
                    className="w-3.5 h-3.5 rounded accent-current cursor-default opacity-80"
                    style={{ accentColor: 'var(--wiki-accent)' }}
                  />
                </span>
              );
            }
            return <input {...props} type={type} />;
          },
          // Images
          img: ({ src, alt, ...props }) => (
            <img
              {...props}
              src={src}
              alt={alt}
              className="max-w-full h-auto rounded-lg my-1.5"
              style={{ border: '1px solid var(--wiki-border)' }}
            />
          ),
          // Details / summary (collapsible sections)
          details: ({ children, ...props }) => (
            <details {...props} className="my-1.5" style={{ color: 'var(--wiki-text2)', fontSize: '13px' }}>{children}</details>
          ),
          summary: ({ children, ...props }) => (
            <summary {...props} className="cursor-pointer font-medium select-none" style={{ color: 'var(--wiki-text)' }}>{children}</summary>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
