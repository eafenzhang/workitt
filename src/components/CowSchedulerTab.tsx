import { useState, useEffect } from 'react';
import { getSchedulerTasks, createSchedulerTask, updateSchedulerTask, deleteSchedulerTask, toggleSchedulerTask, type TaskInfo } from '../api/cowagent';
import { RefreshCwIcon, PlusIcon, ClockIcon, PencilIcon, Trash2Icon, XIcon, ToggleLeftIcon, ToggleRightIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function CowSchedulerTab() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', cron: '', prompt: '' });
  const [editingTask, setEditingTask] = useState<TaskInfo | null>(null);
  const [editForm, setEditForm] = useState({ name: '', cron: '', prompt: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    const list = await getSchedulerTasks();
    setTasks(list);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.cron.trim() || !form.prompt.trim()) {
      toast.error('请填写完整信息');
      return;
    }
    const ok = await createSchedulerTask(form.name, form.cron, form.prompt);
    if (ok) {
      toast.success('任务已创建');
      setShowAdd(false);
      setForm({ name: '', cron: '', prompt: '' });
      fetchTasks();
    } else {
      toast.error('创建失败');
    }
  };

  const handleEdit = async () => {
    if (!editingTask) return;
    if (!editForm.name.trim() || !editForm.cron.trim() || !editForm.prompt.trim()) {
      toast.error('请填写完整信息');
      return;
    }
    const ok = await updateSchedulerTask(editingTask.id, editForm.name, editForm.cron, editForm.prompt);
    if (ok) {
      toast.success('任务已更新');
      setEditingTask(null);
      fetchTasks();
    } else {
      toast.error('更新失败');
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const ok = await deleteSchedulerTask(deletingId);
    if (ok) {
      toast.success('任务已删除');
      setDeletingId(null);
      fetchTasks();
    } else {
      toast.error('删除失败');
    }
  };

  const handleToggle = async (task: TaskInfo) => {
    const ok = await toggleSchedulerTask(task.id);
    if (ok) {
      toast.success(task.enabled !== false ? '任务已暂停' : '任务已恢复');
      fetchTasks();
    } else {
      toast.error('操作失败');
    }
  };

  const openEdit = (task: TaskInfo) => {
    setEditForm({
      name: task.name || '',
      cron: task.cron || '',
      prompt: task.prompt || '',
    });
    setEditingTask(task);
  };

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--wiki-text)' }}>定时任务</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--wiki-text2)' }}>管理 CowAgent 定时任务</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
            <RefreshCwIcon size={12} className={loading ? 'animate-spin' : ''} />刷新
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>
            <PlusIcon size={12} />新建
          </button>
        </div>
      </div>

      {tasks.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 rounded-lg" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <ClockIcon size={48} style={{ color: 'var(--wiki-text3)', opacity: 0.3 }} />
          <p className="mt-3 text-sm" style={{ color: 'var(--wiki-text2)' }}>暂无定时任务</p>
        </div>
      )}

      {tasks.map(task => (
        <div key={task.id} className="rounded-lg p-4" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClockIcon size={16} style={{ color: task.enabled !== false ? '#6366f1' : 'var(--wiki-text3)' }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>{task.name || task.id}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>
                  {task.cron || '无调度'} {task.next_run && `· 下次: ${task.next_run}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${task.enabled !== false ? 'bg-[rgba(16,185,129,0.12)] text-[#10b981]' : 'bg-[var(--wiki-surface2)] text-[var(--wiki-text3)]'}`}>
                {task.enabled !== false ? '运行中' : '已暂停'}
              </span>
              <button onClick={() => handleToggle(task)}
                className="p-1 rounded transition-colors hover:bg-[var(--wiki-surface2)]"
                style={{ color: 'var(--wiki-text3)' }}
                title={task.enabled !== false ? '暂停' : '启用'}>
                {task.enabled !== false ? <ToggleRightIcon size={14} /> : <ToggleLeftIcon size={14} />}
              </button>
              <button onClick={() => openEdit(task)}
                className="p-1 rounded transition-colors hover:bg-[var(--wiki-surface2)]"
                style={{ color: 'var(--wiki-text3)' }}
                title="编辑">
                <PencilIcon size={14} />
              </button>
              <button onClick={() => setDeletingId(task.id)}
                className="p-1 rounded transition-colors hover:bg-[rgba(239,68,68,0.12)]"
                style={{ color: 'var(--wiki-text3)' }}
                title="删除">
                <Trash2Icon size={14} />
              </button>
            </div>
          </div>
          {task.prompt && (
            <div className="mt-2 text-xs p-2 rounded" style={{ background: 'var(--wiki-surface2)', color: 'var(--wiki-text2)' }}>
              {task.prompt}
            </div>
          )}
        </div>
      ))}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }} onClick={() => setShowAdd(false)}>
          <div className="w-[420px] rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>新建定时任务</h3>
              <button onClick={() => setShowAdd(false)}><XIcon size={16} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>名称</label>
                <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="每日报告"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Cron 表达式</label>
                <input value={form.cron} onChange={e => setForm(f => ({...f, cron: e.target.value}))} placeholder="0 9 * * *"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Prompt 提示</label>
                <textarea value={form.prompt} onChange={e => setForm(f => ({...f, prompt: e.target.value}))} rows={3} placeholder="每天上午9点生成昨日工作摘要"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none resize-vertical"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}>取消</button>
                <button onClick={handleAdd} className="px-4 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>创建</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }} onClick={() => setEditingTask(null)}>
          <div className="w-[420px] rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>编辑定时任务</h3>
              <button onClick={() => setEditingTask(null)}><XIcon size={16} style={{ color: 'var(--wiki-text3)' }} /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>名称</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({...f, name: e.target.value}))} placeholder="每日报告"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Cron 表达式</label>
                <input value={editForm.cron} onChange={e => setEditForm(f => ({...f, cron: e.target.value}))} placeholder="0 9 * * *"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div>
                <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--wiki-text3)' }}>Prompt 提示</label>
                <textarea value={editForm.prompt} onChange={e => setEditForm(f => ({...f, prompt: e.target.value}))} rows={3} placeholder="每天上午9点生成昨日工作摘要"
                  className="w-full px-2.5 py-1.5 rounded text-xs outline-none resize-vertical"
                  style={{ background: 'var(--wiki-surface2)', border: '1px solid var(--wiki-border)', color: 'var(--wiki-text)' }} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingTask(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}>取消</button>
                <button onClick={handleEdit} className="px-4 py-1.5 rounded text-xs font-medium" style={{ background: 'var(--wiki-text)', color: 'var(--wiki-bg)' }}>保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--wiki-overlay-heavy)', backdropFilter: 'blur(4px)' }} onClick={() => setDeletingId(null)}>
          <div className="w-[360px] rounded-lg p-5" style={{ background: 'var(--wiki-surface)', border: '1px solid var(--wiki-border)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(239,68,68,0.12)]">
                <Trash2Icon size={16} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--wiki-text)' }}>确认删除</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--wiki-text3)' }}>此操作不可撤销</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--wiki-text2)' }}>
              确定要删除任务 <span className="font-semibold" style={{ color: 'var(--wiki-text)' }}>{tasks.find(t => t.id === deletingId)?.name || deletingId}</span> 吗？
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="px-3 py-1.5 rounded text-xs" style={{ color: 'var(--wiki-text3)' }}>取消</button>
              <button onClick={handleDelete} className="px-4 py-1.5 rounded text-xs font-medium" style={{ background: '#ef4444', color: '#fff' }}>删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
