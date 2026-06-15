import { useState } from 'react';
import { ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  messageId: string;
  conversationId?: string;
  /** Snapshot of the prompt/response context for analysis */
  context?: string;
}

type FeedbackType = 'thumbs_up' | 'thumbs_down' | null;

export default function AIFeedback({ messageId, conversationId, context }: Props) {
  const [feedback, setFeedback] = useState<FeedbackType>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const api = (window as any).electronAPI;

  const submit = async (type: FeedbackType) => {
    if (feedback) return; // Already voted
    setFeedback(type);
    if (type === 'thumbs_down') setShowComment(true);

    try {
      await api?.feedbackSubmit?.({
        messageId, conversationId: conversationId || '', type,
        rating: type === 'thumbs_up' ? 5 : 1, comment: '',
        context: context?.substring(0, 2000) || '',
      });
    } catch { /* silent */ }
  };

  const submitComment = async () => {
    if (!comment.trim()) { setShowComment(false); return; }
    try {
      await api?.feedbackSubmit?.({
        messageId, conversationId: conversationId || '',
        type: 'thumbs_down', rating: 1, comment: comment.trim(),
        context: context?.substring(0, 2000) || '',
      });
      toast.success('感谢反馈');
    } catch { toast.error('提交失败'); }
    setShowComment(false);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => submit('thumbs_up')}
        disabled={!!feedback}
        className={`p-1 rounded transition-colors ${feedback === 'thumbs_up' ? 'text-green-500' : 'text-wiki-text3 hover:text-green-500'}`}
        title="有帮助"
      >
        <ThumbsUpIcon size={13} />
      </button>
      <button
        onClick={() => submit('thumbs_down')}
        disabled={!!feedback}
        className={`p-1 rounded transition-colors ${feedback === 'thumbs_down' ? 'text-red-500' : 'text-wiki-text3 hover:text-red-500'}`}
        title="不满意"
      >
        <ThumbsDownIcon size={13} />
      </button>
      {showComment && (
        <div className="flex items-center gap-1 ml-1">
          <input
            autoFocus
            className="px-2 py-0.5 rounded text-xs outline-none"
            style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text)', border: '1px solid var(--wiki-border)', width: '160px' }}
            placeholder="哪里不满意？"
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitComment(); if (e.key === 'Escape') setShowComment(false); }}
          />
          <button onClick={submitComment} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>发送</button>
        </div>
      )}
    </div>
  );
}
