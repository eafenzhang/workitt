import { MessageSquareIcon } from 'lucide-react';

export default function Messages() {
  return (
    <div data-cmp="Messages" className="flex flex-col h-full items-center justify-center p-8">
      <div className="w-16 h-16 rounded-lg flex items-center justify-center mb-4" style={{ background: 'rgba(236,72,153,0.1)' }}>
        <MessageSquareIcon size={32} style={{ color: '#ec4899' }} />
      </div>
      <h1 className="text-xl font-bold text-wiki-text mb-2">消息中心</h1>
      <p className="text-wiki-text3 text-sm">暂无消息内容</p>
    </div>
  );
}