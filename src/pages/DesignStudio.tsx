import { apiFetch, API } from '../api';
import { useEffect, useState } from 'react';
import {
  PlusIcon, GridIcon, ListIcon, TrashIcon,
  PaletteIcon, MonitorIcon, SmartphoneIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import UnifiedSidebar, { SidebarItem } from '../components/UnifiedSidebar';
import PageHeader from '../components/PageHeader';
import SearchBar, { FilterPills } from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import MinoCanvas from '../components/MinoCanvas';
import NewDesignDialog from '../components/NewDesignDialog';

interface DesignDoc { id: number; title: string; category: string; date: string; tags: string[]; content?: string; }
interface Props { initialView?: string; docId?: number; onOpenSubTab?: (t: string, type: string, e?: {docId?:number}) => void; onCloseSelf?: () => void; }

const CAT_CFG: Record<string,{color:string;bg:string;icon:any}> = {
  '网页':{color:'#6366f1',bg:'rgba(99,102,241,0.12)',icon:MonitorIcon},
  '移动端':{color:'#10b981',bg:'rgba(16,185,129,0.12)',icon:SmartphoneIcon},
  '原型':{color:'#f59e0b',bg:'rgba(245,158,11,0.12)',icon:PaletteIcon},
};

const CAT_MAP: Record<string, string> = {
  web: '设计稿-网页', mobile: '设计稿-移动端',
  prototype: '设计稿-原型', dashboard: '设计稿-网页',
  landing: '设计稿-网页', blank: '设计稿-原型',
};

export default function DesignStudio(p: Props) {
  const tab = !!p.onOpenSubTab;
  const [docs,setDocs] = useState<DesignDoc[]>([]);
  const [cat,setCat] = useState('all');
  const [s,setS] = useState(''); const [si,setSi] = useState('');
  const [vm,setVm] = useState<'grid'|'list'>('grid');
  const [so,setSo] = useState(true);
  const [del,setDel] = useState<number|null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  useEffect(()=>{const t=setTimeout(()=>setS(si),300);return()=>clearTimeout(t)},[si]);
  useEffect(()=>{const q=new URLSearchParams();if(cat!=='all')q.set('category',cat);if(s)q.set('search',s);apiFetch(`${API.documents}?${q}`).then(r=>r.json()).then((d:any[])=>{setDocs(Array.isArray(d)?d.filter((x:DesignDoc)=>x.category?.startsWith('设计稿')):[])}).catch(()=>{})},[cat,s]);
  const openD=(d:DesignDoc)=>{if(p.onOpenSubTab)p.onOpenSubTab(d.title?.substring(0,20)||'设计稿','design-studio-detail',{docId:d.id})};
  const handleCreate = (params: { title: string; template: string; style: string; width: number }) => {
    setShowNewDialog(false)
    if (p.onOpenSubTab) p.onOpenSubTab(params.title, 'design-studio-create', { docId: 0, ...params })
  };
  const cats=['设计稿-网页','设计稿-移动端','设计稿-原型'];
  if(tab&&p.initialView==='design-studio-detail'&&p.docId) return <DesignDetailWrapper docId={p.docId} onClose={p.onCloseSelf!}/>;
  if(tab&&p.initialView==='design-studio-create') return <MinoCanvas onClose={p.onCloseSelf!}/>;
  return (<div className="flex h-full overflow-hidden">
    <UnifiedSidebar open={so} onToggle={()=>setSo(false)} title="分类" actions={<button onClick={openC} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2"><PlusIcon size={12} style={{color:'var(--wiki-text3)'}}/></button>}>
      <SidebarItem label="全部" active={cat==='all'} onClick={()=>setCat('all')}/>
      {cats.map(c=><SidebarItem key={c} label={c.replace('设计稿-','')} active={cat===c} onClick={()=>setCat(cat===c?'all':c)}/>)}
    </UnifiedSidebar>
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="设计稿" description="基于OpenPencil架构的Agent驱动原型设计画板" sidebarOpen={so} onToggleSidebar={()=>setSo(!so)} actions={<button onClick={() => setShowNewDialog(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{background:'var(--wiki-accent)',color:'var(--wiki-bg)'}}><PlusIcon size={14}/>新建画板</button>}/>
      <SearchBar value={si} onChange={setSi} placeholder="搜索设计稿..." extra={<button onClick={()=>setVm(vm==='grid'?'list':'grid')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs" style={{background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text2)'}}>{vm==='grid'?<ListIcon size={13}/>:<GridIcon size={13}/>}<span>{vm==='grid'?'列表':'网格'}</span></button>}/>
      <FilterPills items={[{key:'all',label:'全部',color:'var(--wiki-text)'},...cats.map(c=>({key:c,label:c.replace('设计稿-',''),color:CAT_CFG[c.replace('设计稿-','')]?.color||'#888'}))]} activeKey={cat} onChange={setCat}/>
      <div className="overflow-y-auto flex-1 px-6 pb-4" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
        <div className={vm==='grid'?'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3':'flex flex-col gap-2'}>
          {docs.length===0?<EmptyState icon={PaletteIcon} title="暂无设计稿" description="点击「新建画板」开始"/>:docs.map(d=>{const c=CAT_CFG[d.category?.replace('设计稿-','')]||CAT_CFG['原型'];return vm==='grid'?(
            <div key={d.id} onClick={()=>openD(d)} className="p-4 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/40 hover:bg-wiki-surface2 transition-all duration-200 group" style={{background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)'}}>
              <div className="flex items-start justify-between mb-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:c.bg}}><c.icon size={14} style={{color:c.color}}/></div><button onClick={e=>{e.stopPropagation();setDel(d.id)}} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 rounded" style={{background:'rgba(239,68,68,0.12)',color:'#ef4444'}}>删除</button></div>
              <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{d.title}</div><div className="flex flex-wrap gap-1 mb-3">{(d.tags||[]).slice(0,2).map(t=><span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)'}}>{t}</span>)}</div>
              <div className="flex items-center gap-3 pt-2" style={{borderTop:'1px solid var(--wiki-border)'}}><span className="text-xs px-1.5 py-0.5 rounded" style={{background:c.bg,color:c.color}}>{d.category?.replace('设计稿-','')||'原型'}</span><span className="text-xs text-wiki-text3 ml-auto">{d.date}</span></div>
            </div>):(
            <div key={d.id} onClick={()=>openD(d)} className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/30 hover:bg-wiki-surface2" style={{background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)'}}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:c.bg}}><c.icon size={14} style={{color:c.color}}/></div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium text-wiki-text truncate">{d.title}</div><div className="flex items-center gap-2 mt-0.5">{(d.tags||[]).slice(0,3).map(t=><span key={t} className="text-xs" style={{color:'var(--wiki-text3)'}}>{t}</span>)}</div></div>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{background:c.bg,color:c.color}}>{d.category?.replace('设计稿-','')||'原型'}</span>
              <span className="text-xs text-wiki-text3 w-24 text-right">{d.date}</span>
              <button onClick={e=>{e.stopPropagation();setDel(d.id)}} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100" style={{background:'rgba(239,68,68,0.12)'}}><TrashIcon size={12} style={{color:'#ef4444'}}/></button>
            </div>)})}
        </div>
      </div>
    </div>
    <ConfirmDialog open={del!==null} title="确认删除" message="确定要删除此设计稿？" onConfirm={()=>{if(del!==null){apiFetch(API.documentsById(del),{method:'DELETE'}).then(()=>{setDocs(prev=>prev.filter(x=>x.id!==del));setDel(null);toast.success('已删除')}).catch(()=>toast.error('删除失败'))}}} onCancel={()=>setDel(null)}/>
    <NewDesignDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} onCreate={handleCreate} />
  </div>);
}

// ── Wrapper: loads doc from API, passes to MinoCanvas ──
function DesignDetailWrapper({docId,onClose}:{docId:number;onClose:()=>void}) {
  const [doc,setDoc]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    apiFetch(API.documentsById(docId)).then(r=>r.json()).then(d=>{setDoc(d);setLoading(false)}).catch(()=>setLoading(false));
  },[docId]);
  if(loading)return <div className="flex items-center justify-center h-full text-sm text-wiki-text3">加载中...</div>;
  if(!doc)return <div className="flex items-center justify-center h-full text-sm" style={{color:'var(--wiki-danger)'}}>加载失败</div>;
  return <MinoCanvas docId={docId} initialDoc={doc} onClose={onClose}/>;
}
