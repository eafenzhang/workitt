import { apiFetch, API } from '../api';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  PlusIcon, GridIcon, ListIcon, TrashIcon, XIcon, SparklesIcon, SendIcon,
  RotateCwIcon, MonitorIcon, SmartphoneIcon, SaveIcon, Edit3Icon,
  PaletteIcon, SquareIcon, TypeIcon, ImageIcon, CircleIcon, MoveIcon, LayersIcon,
  UploadIcon, Undo2Icon, Redo2Icon, EyeIcon, EyeOffIcon, LockIcon,
  CopyIcon, DownloadIcon, FileIcon,
  AlignStartVerticalIcon, AlignCenterVerticalIcon, AlignEndVerticalIcon,
  AlignStartHorizontalIcon, AlignCenterHorizontalIcon, AlignEndHorizontalIcon
} from 'lucide-react';
import { toast } from 'sonner';
import UnifiedSidebar, { SidebarItem } from '../components/UnifiedSidebar';
import PageHeader from '../components/PageHeader';
import SearchBar, { FilterPills, type FilterPill } from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import MinoCanvas from '../components/MinoCanvas';

// ── OpenPencil-inspired Data Model ──
interface DesignNode {
  id: string; type: 'frame'|'rect'|'text'|'image'|'ellipse';
  name?: string; role?: string;
  x: number; y: number; width: number; height: number;
  rotation?: number; opacity?: number;
  fill?: string; stroke?: string; cornerRadius?: number;
  effects?: { type: 'shadow'|'blur'; value: string }[];
  content?: string; fontSize?: number; fontWeight?: number;
  fontFamily?: string; textAlign?: 'left'|'center'|'right';
  src?: string; imagePrompt?: string;
  layout?: 'vertical'|'horizontal'|'none'; gap?: number; padding?: number;
  children?: DesignNode[];
  locked?: boolean; visible?: boolean;
}
interface DesignDoc { id: number; title: string; category: string; date: string; tags: string[]; content?: string; }
interface Props { initialView?: string; docId?: number; onOpenSubTab?: (t: string, type: string, e?: {docId?:number}) => void; onCloseSelf?: () => void; }

const CAT_CFG: Record<string,{color:string;bg:string;icon:any}> = {
  '网页':{color:'#6366f1',bg:'rgba(99,102,241,0.12)',icon:MonitorIcon},
  '移动端':{color:'#10b981',bg:'rgba(16,185,129,0.12)',icon:SmartphoneIcon},
  '原型':{color:'#f59e0b',bg:'rgba(245,158,11,0.12)',icon:PaletteIcon},
};
const VP_PRESETS = { desktop:1024, tablet:768, mobile:375 };
const FONTS = ['system-ui','Inter','Georgia','monospace'];
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6','#333','#666','#999','#fff','#f8f9fa','#1a1a2e'];

// Shared inline style objects — reduces repetition in the component
const S = {
  input: {background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text)'} as React.CSSProperties,
  panel: {background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)'} as React.CSSProperties,
  surface: {background:'var(--wiki-surface2)'} as React.CSSProperties,
  text2: {color:'var(--wiki-text2)'} as React.CSSProperties,
  text3: {color:'var(--wiki-text3)'} as React.CSSProperties,
  accentBtn: (bg?:string)=>({background:bg||'var(--wiki-text)',color:'var(--wiki-bg)'}) as React.CSSProperties,
  border: {borderColor:'var(--wiki-border)'} as React.CSSProperties,
};

export default function DesignStudio(p: Props) {
  const tab = !!p.onOpenSubTab;
  const [docs,setDocs] = useState<DesignDoc[]>([]);
  const [cat,setCat] = useState('all');
  const [s,setS] = useState(''); const [si,setSi] = useState('');
  const [vm,setVm] = useState<'grid'|'list'>('grid');
  const [so,setSo] = useState(true);
  const [del,setDel] = useState<number|null>(null);
  useEffect(()=>{const t=setTimeout(()=>setS(si),300);return()=>clearTimeout(t)},[si]);
  useEffect(()=>{const q=new URLSearchParams();if(cat!=='all')q.set('category',cat);if(s)q.set('search',s);apiFetch(`${API.documents}?${q}`).then(r=>r.json()).then((d:any[])=>{setDocs(Array.isArray(d)?d.filter((x:DesignDoc)=>x.category?.startsWith('设计稿')):[])}).catch(()=>{})},[cat,s]);
  const openD=(d:DesignDoc)=>{if(p.onOpenSubTab)p.onOpenSubTab(d.title?.substring(0,20)||'设计稿','design-studio-detail',{docId:d.id})};
  const openC=()=>{if(p.onOpenSubTab)p.onOpenSubTab('新建画板','design-studio-create')};
  const cats=['设计稿-网页','设计稿-移动端','设计稿-原型'];
  if(tab&&p.initialView==='design-studio-detail'&&p.docId){
    // Load the doc and pass it to MinoCanvas
    return <DesignDetailWrapper docId={p.docId} onClose={p.onCloseSelf!}/>;
  }
  if(tab&&p.initialView==='design-studio-create')return<MinoCanvas onClose={p.onCloseSelf!}/>;
  return (<div className="flex h-full overflow-hidden">
    <UnifiedSidebar open={so} onToggle={()=>setSo(false)} title="分类" actions={<button onClick={openC} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2"><PlusIcon size={12} style={S.text3}/></button>}>
      <SidebarItem label="全部" active={cat==='all'} onClick={()=>setCat('all')}/>
      {cats.map(c=><SidebarItem key={c} label={c.replace('设计稿-','')} active={cat===c} onClick={()=>setCat(cat===c?'all':c)}/>)}
    </UnifiedSidebar>
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="设计稿" description="基于OpenPencil架构的Agent驱动原型设计画板" sidebarOpen={so} onToggleSidebar={()=>setSo(!so)} actions={<button onClick={openC} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{background:'var(--wiki-accent)',color:'var(--wiki-bg)'}}><PlusIcon size={14}/>新建画板</button>}/>
      <SearchBar value={si} onChange={setSi} placeholder="搜索设计稿..." extra={<button onClick={()=>setVm(vm==='grid'?'list':'grid')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs" style={{background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text2)'}}>{vm==='grid'?<ListIcon size={13}/>:<GridIcon size={13}/>}<span>{vm==='grid'?'列表':'网格'}</span></button>}/>
      <FilterPills items={[{key:'all',label:'全部',color:'var(--wiki-text)'},...cats.map(c=>({key:c,label:c.replace('设计稿-',''),color:CAT_CFG[c.replace('设计稿-','')]?.color||'#888'}))]} activeKey={cat} onChange={setCat}/>
      <div className="overflow-y-auto flex-1 px-6 pb-4" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
        <div className={vm==='grid'?'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3':'flex flex-col gap-2'}>
          {docs.length===0?<EmptyState icon={PaletteIcon} title="暂无设计稿" description="点击「新建画板」开始"/>:docs.map(d=>{const c=CAT_CFG[d.category?.replace('设计稿-','')]||CAT_CFG['原型'];return vm==='grid'?(
            <div key={d.id} onClick={()=>openD(d)} className="p-4 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/40 hover:bg-wiki-surface2 transition-all duration-200 group" style={S.panel}>
              <div className="flex items-start justify-between mb-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:c.bg}}><c.icon size={14} style={{color:c.color}}/></div><button onClick={e=>{e.stopPropagation();setDel(d.id)}} className="opacity-0 group-hover:opacity-100 text-xs px-2 py-0.5 rounded" style={{background:'var(--wiki-danger-bg)',color:'var(--wiki-danger)'}}>删除</button></div>
              <div className="text-sm font-semibold text-wiki-text mb-1 line-clamp-2">{d.title}</div><div className="flex flex-wrap gap-1 mb-3">{(d.tags||[]).slice(0,2).map(t=><span key={t} className="text-xs px-1.5 py-0.5 rounded" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)'}}>{t}</span>)}</div>
              <div className="flex items-center gap-3 pt-2" style={{borderTop:'1px solid var(--wiki-border)'}}><span className="text-xs px-1.5 py-0.5 rounded" style={{background:c.bg,color:c.color}}>{d.category?.replace('设计稿-','')||'原型'}</span><span className="text-xs text-wiki-text3 ml-auto">{d.date}</span></div>
            </div>):(
            <div key={d.id} onClick={()=>openD(d)} className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer hover:border-[var(--wiki-info)]/30 hover:bg-wiki-surface2" style={S.panel}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:c.bg}}><c.icon size={14} style={{color:c.color}}/></div>
              <div className="flex-1 min-w-0"><div className="text-sm font-medium text-wiki-text truncate">{d.title}</div><div className="flex items-center gap-2 mt-0.5">{(d.tags||[]).slice(0,3).map(t=><span key={t} className="text-xs" style={S.text3}>{t}</span>)}</div></div>
              <span className="text-xs px-2 py-0.5 rounded font-medium" style={{background:c.bg,color:c.color}}>{d.category?.replace('设计稿-','')||'原型'}</span>
              <span className="text-xs text-wiki-text3 w-24 text-right">{d.date}</span>
              <button onClick={e=>{e.stopPropagation();setDel(d.id)}} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100" style={{background:'var(--wiki-danger-bg)'}}><TrashIcon size={12} style={{color:'var(--wiki-danger)'}}/></button>
            </div>)})}
        </div>
      </div>
    </div>
    <ConfirmDialog open={del!==null} title="确认删除" message="确定要删除此设计稿？" onConfirm={()=>{if(del!==null){apiFetch(API.documentsById(del),{method:'DELETE'}).then(()=>{setDocs(prev=>prev.filter(x=>x.id!==del));setDel(null);toast.success('已删除')}).catch(()=>toast.error('删除失败'))}}} onCancel={()=>setDel(null)}/>
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

// ── OLD Engine-Powered DesignEditor (kept as reference, unused) ──
function _DesignEditor({docId,onClose}:{docId:number;onClose:()=>void}) {
  const [loadedDoc,setLoadedDoc]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    apiFetch(API.documentsById(docId)).then(r=>r.json()).then((d:any)=>{
      setLoadedDoc(d);
      setLoading(false);
    }).catch(()=>{setLoading(false);toast.error('加载失败')});
  },[docId]);
  if(loading)return<div className="flex items-center justify-center h-full text-sm text-wiki-text3">加载中...</div>;
  if(!loadedDoc)return<div className="flex items-center justify-center h-full text-sm" style={{color:'var(--wiki-danger)'}}>加载失败</div>;
  return <DesignProvider onDocumentChange={(doc)=>{
    // Auto-save placeholder — actual save is manual
  }}><EditorInner docId={docId} initialDoc={loadedDoc} onClose={onClose}/></DesignProvider>;
}

// ── Inner editor that uses engine hooks ──
function EditorInner({docId,initialDoc,onClose}:{docId:number;initialDoc:any;onClose:()=>void}) {
  const engine=useDesignEngine();
  const doc=useDocument();
  const {selectedIds,activeId}=useSelection();
  const redoState=useHistory();
  const [tool,setTool]=useActiveTool();
  const viewport=useViewport();

  // Initialize engine from loaded document
  const initialized=useRef(false);
  useEffect(()=>{
    if(initialized.current)return;
    initialized.current=true;
    try{
      const p=JSON.parse(initialDoc.content||'{}');
      const children=Array.isArray(p.children||p.elements)?(p.children||p.elements):[];
      engine.loadDocument({
        id:'doc_'+docId, name:initialDoc.title||'未命名',
        pages:[{id:'page_1',name:'页面 1',children}],
      });
    }catch{engine.loadDocument({
      id:'doc_'+docId, name:initialDoc.title||'未命名',
      pages:[{id:'page_1',name:'页面 1',children:[]}],
    })}
  },[engine,initialDoc,docId]);

  const [title,setTitle]=useState(initialDoc.title||'');
  const [sideTab,setSideTab]=useState<'pages'|'layers'>('layers');
  const [rightTab,setRightTab]=useState<'layers'|'code'|'preview'|'plan'>('layers');
  const [plan,setPlan]=useState('');
  const [previewKey,setPreviewKey]=useState(0);
  const [styleRef,setStyleRef]=useState('auto');
  const [aiIn,setAiIn]=useState('');
  const [aiGen,setAiGen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [zoom,setZoom]=useState(100);
  const [chatOpen,setChatOpen]=useState(false);
  const [chatMsgs,setChatMsgs]=useState<{role:string;content:string}[]>([]);
  const [vp,setVp]=useState(1024);
  const [renamingId,setRenamingId]=useState<string|null>(null);
  const [renameVal,setRenameVal]=useState('');
  const [ctxMenu,setCtxMenu]=useState<{x:number;y:number;nodeId:string}|null>(null);
  const clipboardRef=useRef<any[]>([]);
  const canvas=useRef<HTMLDivElement>(null);
  const fileInp=useRef<HTMLInputElement>(null);
  const chatRef=useRef<HTMLDivElement>(null);

  const page=doc.pages[0];
  const nodes=page?.children||[];
  const activeNode=activeId?engine.documentManager.findNodeById(page,activeId):null;

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:'smooth'})},[chatMsgs]);

  const snap=(v:number)=>Math.round(v/16)*16;

  // ── Canvas interaction state ──
  const dragRef=useRef<{type:'move'|'resize'|'boxselect'|'draw'|null;startX:number;startY:number;nodeId?:string;handle?:string;origX?:number;origY?:number;origW?:number;origH?:number}>({type:null,startX:0,startY:0});
  const boxRef=useRef<HTMLDivElement>(null);

  const toScene = useCallback((clientX:number, clientY:number)=>{
    const r=canvas.current?.getBoundingClientRect(); if(!r) return {x:0,y:0};
    const s=zoom/100;
    return {x:(clientX-r.left)/s, y:(clientY-r.top)/s};
  },[zoom]);

  const hitTestResize = useCallback((sceneX:number, sceneY:number, node:any)=>{
    if(!node||node.locked) return null;
    const HANDLE=8, nX=node.x, nY=node.y, nW=node.width, nH=node.height;
    const corners = [
      {h:'nw', x:nX, y:nY},{h:'ne', x:nX+nW, y:nY},
      {h:'sw', x:nX, y:nY+nH},{h:'se', x:nX+nW, y:nY+nH},
    ];
    const edges = [
      {h:'n', x:nX+nW/2, y:nY},{h:'s', x:nX+nW/2, y:nY+nH},
      {h:'w', x:nX, y:nY+nH/2},{h:'e', x:nX+nW, y:nY+nH/2},
    ];
    for(const c of corners){if(Math.abs(sceneX-c.x)<HANDLE&&Math.abs(sceneY-c.y)<HANDLE) return c.h;}
    for(const e of edges){if(Math.abs(sceneX-e.x)<HANDLE/1.5&&Math.abs(sceneY-e.y)<HANDLE/1.5) return e.h;}
    return null;
  },[]);

  const hitTestNode = useCallback((sceneX:number, sceneY:number)=>{
    const all = engine.documentManager.getFlatNodes(page).reverse(); // topmost first
    for(const n of all){
      if(n.visible===false||n.locked) continue;
      if(sceneX>=n.x&&sceneX<=n.x+n.width&&sceneY>=n.y&&sceneY<=n.y+n.height) return n;
    }
    return null;
  },[engine,page]);

  const handleCanvasMouseDown = useCallback((e:React.MouseEvent)=>{
    const scene = toScene(e.clientX, e.clientY);
    // Drawing tool
    if(tool!=='select'){
      dragRef.current={type:'draw',startX:snap(scene.x),startY:snap(scene.y)};
      return;
    }
    // Check resize handles on active node first
    if(activeNode){
      const handle = hitTestResize(scene.x, scene.y, activeNode);
      if(handle){
        dragRef.current={type:'resize',startX:scene.x,startY:scene.y,nodeId:activeNode.id,handle,
          origX:activeNode.x,origY:activeNode.y,origW:activeNode.width,origH:activeNode.height};
        return;
      }
    }
    // Hit test for node selection
    const hit = hitTestNode(scene.x, scene.y);
    if(hit){
      if(e.shiftKey){
        engine.select([...engine.selectedIds, hit.id], hit.id);
      } else {
        engine.select([hit.id], hit.id);
      }
      dragRef.current={type:'move',startX:scene.x,startY:scene.y,nodeId:hit.id,origX:hit.x,origY:hit.y};
      // Also track all selected nodes' origins for multi-drag
      (dragRef.current as any)._selected = engine.selectedIds.map((id:string)=>{
        const n = engine.documentManager.findNodeById(page,id);
        return n?{id,ox:n.x,oy:n.y}:null;
      }).filter(Boolean);
      return;
    }
    // Start box select or clear
    engine.clearSelection();
    dragRef.current={type:'boxselect',startX:scene.x,startY:scene.y};
  },[tool,activeNode,toScene,hitTestResize,hitTestNode,snap,engine,page]);

  const handleCanvasMouseMove = useCallback((e:React.MouseEvent)=>{
    const scene = toScene(e.clientX, e.clientY);
    const d = dragRef.current;
    if(!d.type) return;

    if(d.type==='move' && d.nodeId && d._selected){
      const dx = snap(scene.x - d.startX), dy = snap(scene.y - d.startY);
      if(dx===0 && dy===0) return; // only on grid snap
      for(const s of d._selected as any[]){
        engine.setNodePosition(s.id, {x:snap(s.ox+dx), y:snap(s.oy+dy)});
      }
    } else if(d.type==='resize' && d.nodeId){
      const dx = scene.x - d.startX, dy = scene.y - d.startY;
      let {origX:ox,origY:oy,origW:ow,origH:oh} = d as any;
      let nx=ox, ny=oy, nw=ow, nh=oh;
      switch(d.handle){
        case 'se': nw=Math.max(16,ow+dx); nh=Math.max(16,oh+dy); break;
        case 'sw': nx=ox+dx; nw=Math.max(16,ow-dx); nh=Math.max(16,oh+dy); break;
        case 'ne': nw=Math.max(16,ow+dx); nh=Math.max(16,oh-dy); ny=oy+dy; break;
        case 'nw': nx=ox+dx; nw=Math.max(16,ow-dx); ny=oy+dy; nh=Math.max(16,oh-dy); break;
        case 'e': nw=Math.max(16,ow+dx); break;
        case 'w': nx=ox+dx; nw=Math.max(16,ow-dx); break;
        case 's': nh=Math.max(16,oh+dy); break;
        case 'n': ny=oy+dy; nh=Math.max(16,oh-dy); break;
      }
      engine.setNodePosition(d.nodeId, {x:snap(nx), y:snap(ny)});
      engine.setNodeSize(d.nodeId, {width:snap(nw), height:snap(nh)});
    } else if(d.type==='boxselect'){
      // Update box rect via ref for DOM rendering
      if(boxRef.current){
        const x1=Math.min(d.startX,scene.x), y1=Math.min(d.startY,scene.y);
        const x2=Math.max(d.startX,scene.x), y2=Math.max(d.startY,scene.y);
        boxRef.current.style.display='block';
        boxRef.current.style.left=x1+'px'; boxRef.current.style.top=y1+'px';
        boxRef.current.style.width=(x2-x1)+'px'; boxRef.current.style.height=(y2-y1)+'px';
      }
    }
  },[toScene,snap,engine]);

  const handleCanvasMouseUp = useCallback((e:React.MouseEvent)=>{
    const d = dragRef.current;
    if(d.type==='draw'){
      const scene = toScene(e.clientX, e.clientY);
      engine.createNodeByTool(tool, snap(scene.x), snap(scene.y));
      setTool('select');
    } else if(d.type==='boxselect'){
      // Select all nodes within the box
      if(boxRef.current) boxRef.current.style.display='none';
      const scene = toScene(e.clientX, e.clientY);
      const x1=Math.min(d.startX,scene.x), y1=Math.min(d.startY,scene.y);
      const x2=Math.max(d.startX,scene.x), y2=Math.max(d.startY,scene.y);
      if(x2-x1>4||y2-y1>4){ // minimum box size
        const all = engine.documentManager.getFlatNodes(page);
        const ids = all.filter(n=>n.x<x2&&n.x+n.width>x1&&n.y<y2&&n.y+n.height>y1).map(n=>n.id);
        if(ids.length>0) engine.select(ids, ids[0]);
      }
    }
    dragRef.current={type:null,startX:0,startY:0};
  },[tool,toScene,snap,engine,page,setTool]);

  // Resize handle renderer
  const renderHandles = (node:any)=>{
    if(activeId!==node.id) return null;
    const HANDLE=8;
    const positions = [
      {h:'nw',x:node.x,y:node.y,c:'nw-resize'},{h:'ne',x:node.x+node.width,y:node.y,c:'ne-resize'},
      {h:'sw',x:node.x,y:node.y+node.height,c:'sw-resize'},{h:'se',x:node.x+node.width,y:node.y+node.height,c:'se-resize'},
      {h:'n',x:node.x+node.width/2,y:node.y,c:'n-resize'},{h:'s',x:node.x+node.width/2,y:node.y+node.height,c:'s-resize'},
      {h:'w',x:node.x,y:node.y+node.height/2,c:'w-resize'},{h:'e',x:node.x+node.width,y:node.y+node.height/2,c:'e-resize'},
    ];
    return <>{positions.map(p=>(<div key={p.h} className="absolute rounded-full" style={{
      left:p.x-HANDLE/2,top:p.y-HANDLE/2,width:HANDLE,height:HANDLE,
      background:'#fff',border:'2px solid #6366f1',cursor:p.c,zIndex:10,
    }}/>))}</>;
  };

  // Original handleClick replaced by mousedown
  const handleClick=(e:React.MouseEvent)=>{/* handled by mouseDown/mouseUp */};

  const handleKeyDown=(e:React.KeyboardEvent|KeyboardEvent)=>{
    if((e.target as HTMLElement)?.tagName==='INPUT'||(e.target as HTMLElement)?.tagName==='TEXTAREA')return;
    const s=e.shiftKey?10:1;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();engine.removeSelected();return}
    if(e.key==='Escape'){engine.clearSelection();setTool('select');return}
    if(e.ctrlKey||e.metaKey){
      if(e.key==='z'&&!e.shiftKey){e.preventDefault();engine.undo();return}
      if((e.key==='z'&&e.shiftKey)||e.key==='Z'){e.preventDefault();engine.redo();return}
      if(e.key==='a'){e.preventDefault();const all=engine.documentManager.getFlatNodes(page).map(n=>n.id);if(all.length>0)engine.select(all,all[0]);return}
      if(e.key==='c'){e.preventDefault();const sel=engine.selectedIds.map(id=>engine.documentManager.findNodeById(page,id)).filter(Boolean);clipboardRef.current=JSON.parse(JSON.stringify(sel));return}
      if(e.key==='v'){e.preventDefault();for(const n of clipboardRef.current){const copy={...n,id:'n_'+Date.now()+'_'+Math.random().toString(36).slice(2),x:n.x+20,y:n.y+20};engine.addNode(copy)}return}
      if(e.key==='d'){e.preventDefault();engine.duplicateSelected();return}
      if(e.key==='g'&&!e.shiftKey){e.preventDefault();engine.groupSelected();return}
      if((e.key==='g'&&e.shiftKey)||e.key==='G'){e.preventDefault();engine.ungroupSelected();return}
      return
    }
    if(!activeId)return;
    const m:Record<string,[number,number]>={ArrowUp:[0,-s],ArrowDown:[0,s],ArrowLeft:[-s,0],ArrowRight:[s,0]};
    const mv=m[e.key];if(mv){e.preventDefault();engine.moveNode(activeId,mv[0],mv[1])}
  };

  useEffect(()=>{window.addEventListener('keydown',handleKeyDown as any);return()=>window.removeEventListener('keydown',handleKeyDown as any)},[activeId,engine]);

  const aiGenFn=async()=>{if(!aiIn.trim())return;setChatMsgs(prev=>[...prev,{role:'user',content:aiIn}]);setAiGen(true);
    const ctx=nodes.length>0?`\n当前节点:${JSON.stringify(nodes)}`:'';
    const styleNote=styleRef&&styleRef!=='auto'?` 风格:${styleRef}。`:'';
    const sp=`你是一个设计代码生成器。只输出JSON数组，不要任何其他文字。${styleNote}画布${vp}x768。每个元素是对象，必含type,x,y,width,height。type可选:frame(可含children+layout+gap+padding),rect,text(含content+fontSize),ellipse,image。颜色:#6366f1/#10b981/#f59e0b/#ef4444/#333/#fff/#f8f9fa/#e5e7eb。圆角8-16。示例如:[{"type":"frame","x":0,"y":0,"width":375,"height":768,"fill":"#f8f9fa","children":[{"type":"text","x":40,"y":60,"width":295,"height":28,"content":"Welcome","fontSize":24,"fontWeight":700,"fill":"#333"}]}]。${ctx}`;
    try{const api=(window as any).electronAPI;if(!api?.chatSend)throw new Error('IPC不可用，请重启');
      const r=await api.chatSend({messages:[{role:'user',content:aiIn+(styleRef&&styleRef!=='auto'?` [风格:${styleRef}]`:'')}],systemPrompt:sp,toolsEnabled:false,responseFormat:'json_object'});
      if(!r)throw new Error('无响应');if(r.error)throw new Error(r.error);
      let raw=(r.content||'').trim();if(!raw)throw new Error('AI返回空内容');
      let reply=raw.replace(/```[a-z]*\n?/gi,'').replace(/`/g,'').trim();
      let m=reply.match(/\[[\s\S]*\]/);if(!m)m=reply.match(/\{[\s\S]*\}/);
      if(!m){const lb=reply.lastIndexOf('[');const lc=reply.lastIndexOf('{');const s2=Math.max(lb,lc);if(s2>=0){const sub=reply.substring(s2);const m2=sub.match(/\[[\s\S]*\]/)||sub.match(/\{[\s\S]*\}/);if(m2)m=m2}}
      if(!m)throw new Error('AI未返回JSON，开头: '+raw.substring(0,80));
      let jsonStr=m[0];let parsed;
      try{parsed=JSON.parse(jsonStr)}catch(pe){try{jsonStr=jsonStr.replace(/,\s*([}\]])/g,'$1').replace(/'/g,'"').replace(/([{,]\s*)(\w+)(\s*:)/g,'$1"$2"$3').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');parsed=JSON.parse(jsonStr)}catch{try{jsonStr=jsonStr.replace(/\\(?!["\\/bfnrtu])/g,'\\\\');parsed=JSON.parse(jsonStr)}catch{throw new Error('JSON解析失败: '+pe.message)}}}
      let na=parsed;if(!Array.isArray(parsed)&&parsed&&parsed.nodes&&Array.isArray(parsed.nodes)){if(parsed.plan)setPlan(parsed.plan);na=parsed.nodes}
      if(!Array.isArray(na)||na.length===0)throw new Error('返回的不是有效数组');
      for(const el of na){engine.addNode({...el,id:'ai_'+Date.now()+'_'+Math.random().toString(36).slice(2),name:el.type||'Element',rotation:0,opacity:1,visible:true,locked:false})}
      setChatMsgs(prev=>[...prev,{role:'assistant',content:'已生成'+na.length+'个节点'}]);toast.success('已生成'+na.length+'个节点');setAiIn('')
    }catch(e){const em=(e as any).message||String(e);setChatMsgs(prev=>[...prev,{role:'assistant',content:'生成失败: '+em}]);toast.error('生成失败: '+em)}finally{setAiGen(false)}
  };

  const save=async()=>{setSaving(true);try{await apiFetch(API.documentsById(docId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category:'设计稿-原型',content:JSON.stringify({version:'1.0',viewport:{width:vp,height:768},children:nodes})})});toast.success('已保存')}catch{toast.error('保存失败')}finally{setSaving(false)}};

  const gridBg=`repeating-linear-gradient(0deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px),repeating-linear-gradient(90deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px)`;
  const isDark=typeof document!=='undefined'&&document.documentElement.classList.contains('dark');

  const renderN=(n:any):JSX.Element=>{
    const isSel=n.id===activeId;
    const s:React.CSSProperties={position:'absolute',left:n.x,top:n.y,width:n.width,height:n.height,background:Array.isArray(n.fill)?n.fill[0]?.color||n.fill:n.fill||undefined,opacity:n.opacity??1,borderRadius:n.cornerRadius||0,border:n.stroke?`${n.stroke.color||n.stroke||'#666'} ${n.stroke?.width||1}px solid`:undefined,boxShadow:isSel?'0 0 0 2px #6366f1':undefined,transform:n.rotation?`rotate(${n.rotation}deg)`:undefined,cursor:'pointer',overflow:'hidden',display:n.layout?'flex':'block',flexDirection:n.layout==='vertical'?'column':n.layout==='horizontal'?'row':undefined,gap:n.gap||undefined,padding:n.padding||undefined};
    const click=(e:React.MouseEvent)=>{e.stopPropagation();engine.select([n.id],n.id)};
    if(n.type==='text')return<div key={n.id} style={{...s,fontSize:n.fontSize||14,fontWeight:n.fontWeight||400,fontFamily:n.fontFamily||'system-ui',textAlign:n.textAlign||'left',display:'flex',alignItems:'center',background:'transparent',color:n.color||'#333'}} onClick={click}>{n.content||'Text'}</div>;
    if(n.type==='image')return<div key={n.id} style={{...s,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={click}>{n.src?<img src={n.src} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>:<ImageIcon size={24} style={{color:'#ccc'}}/>}</div>;
    if(n.type==='ellipse')return<div key={n.id} style={{...s,borderRadius:'50%'}} onClick={click}/>;
    return<div key={n.id} style={s} onClick={click}>{n.children?.map((c:any)=>renderN(c))}</div>;
  };

  const flatten=(ns:any[],depth=0):{node:any;depth:number}[]=>{let r:{node:any;depth:number}[]=[];for(const n of ns){r.push({node:n,depth});if(n.children)r=r.concat(flatten(n.children,depth+1))}return r};
  const layers=flatten(nodes);

  return(<div className="flex flex-col h-full">
    {/* Top toolbar */}
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{borderBottom:'1px solid var(--wiki-border)'}}>
      <button onClick={onClose} className="p-1 rounded hover:bg-wiki-surface2"><XIcon size={15} style={S.text3}/></button>
      <input className="text-sm font-semibold bg-transparent outline-none w-40" style={{color:'var(--wiki-text)'}} value={title} onChange={e=>setTitle(e.target.value)}/>
      <div className="w-px h-5 mx-1" style={{background:'var(--wiki-border)'}}/>
      <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)'}}>
        {([['select',MoveIcon],['frame',LayersIcon],['rect',SquareIcon],['text',TypeIcon],['ellipse',CircleIcon],['image',ImageIcon]] as any[]).map(([t,I])=>(
          <button key={t} onClick={()=>setTool(t)} className="p-1 rounded" style={{background:tool===t?'var(--wiki-text)':'transparent',color:tool===t?'var(--wiki-bg)':'var(--wiki-text3)'}} title={t}><I size={13}/></button>))}
      </div>
      {/* Undo / Redo */}
      <button onClick={()=>engine.undo()} disabled={!redoState.canUndo} className="p-1 rounded hover:bg-wiki-surface2 disabled:opacity-30" title="撤销 (Ctrl+Z)"><Undo2Icon size={13} style={{color:'var(--wiki-text2)'}}/></button>
      <button onClick={()=>engine.redo()} disabled={!redoState.canRedo} className="p-1 rounded hover:bg-wiki-surface2 disabled:opacity-30" title="重做 (Ctrl+Shift+Z)"><Redo2Icon size={13} style={{color:'var(--wiki-text2)'}}/></button>
      {/* Alignment tools (visible when 2+ nodes selected) */}
      {selectedIds.length >= 2 && <>
        <div className="w-px h-4 mx-0.5" style={{background:'var(--wiki-border)'}}/>
        {[[AlignStartVerticalIcon,'left','左对齐'],[AlignCenterVerticalIcon,'center-h','水平居中'],[AlignEndVerticalIcon,'right','右对齐'],[AlignStartHorizontalIcon,'top','顶对齐'],[AlignCenterHorizontalIcon,'center-v','垂直居中'],[AlignEndHorizontalIcon,'bottom','底对齐']].map(([I,dir,tt]:any)=>(
          <button key={dir} onClick={()=>engine.documentManager.alignNodes(selectedIds,dir)} className="p-1 rounded hover:bg-wiki-surface2" title={tt}><I size={13} style={{color:'var(--wiki-text3)'}}/></button>
        ))}
      </>}
      <select value={vp} onChange={e=>setVp(Number(e.target.value))} className="text-xs px-2 py-1 rounded outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>
        {Object.entries(VP_PRESETS).map(([k,v])=><option key={k} value={v}>{k} {v}px</option>)}</select>
      <button onClick={()=>setZoom(z=>Math.max(25,z-25))} className="text-xs px-1.5 py-0.5 rounded hover:bg-wiki-surface2" style={S.text2}>-</button>
      <span className="text-xs text-wiki-text2 w-8 text-center">{zoom}%</span>
      <button onClick={()=>setZoom(z=>Math.min(200,z+25))} className="text-xs px-1.5 py-0.5 rounded hover:bg-wiki-surface2" style={S.text2}>+</button>
      <input type="file" ref={fileInp} accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{engine.addNode({id:'img_'+Date.now(),type:'image',name:'Image',x:100,y:100,width:200,height:150,rotation:0,opacity:1,visible:true,locked:false,src:ev.target?.result as string,cornerRadius:8})};r.readAsDataURL(f);e.target.value=''}}/>
      <button onClick={()=>fileInp.current?.click()} className="p-1 rounded hover:bg-wiki-surface2" title="导入图片"><UploadIcon size={13} style={S.text3}/></button>
      <button onClick={()=>{
        navigator.clipboard.writeText(exportAsSVG(nodes)).then(()=>toast.success('SVG 已复制到剪贴板'));
      }} className="p-1 rounded hover:bg-wiki-surface2" title="复制 SVG"><CopyIcon size={13} style={S.text3}/></button>
      <button onClick={()=>{
        const svg = exportAsSVG(nodes);
        const blob = new Blob([svg], {type:'image/svg+xml'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=(title||'design')+'.svg';
        a.click(); URL.revokeObjectURL(url);
      }} className="p-1 rounded hover:bg-wiki-surface2" title="下载 SVG"><DownloadIcon size={13} style={S.text3}/></button>
      {/* SVG import */}
      <input type="file" accept=".svg" className="hidden" id="svg-import" onChange={e=>{
        const f=e.target.files?.[0];if(!f)return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const svgString = ev.target?.result as string;
          const imported = parseSVGNodes(svgString);
          for(const n of imported) engine.addNode(n);
          toast.success(`已导入 ${imported.length} 个节点`);
        };
        reader.readAsText(f);
        e.target.value='';
      }}/>
      <button onClick={()=>(document.getElementById('svg-import') as HTMLInputElement)?.click()} className="p-1 rounded hover:bg-wiki-surface2" title="导入 SVG"><FileIcon size={13} style={S.text3}/></button>
      <div className="ml-auto flex items-center gap-2"><span className="text-xs text-wiki-text3">{nodes.length}节点</span><button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{background:'var(--wiki-text)',color:'var(--wiki-bg)'}}><SaveIcon size={11}/>保存</button></div>
    </div>

    <div className="flex-1 flex overflow-hidden">
      {/* Left panel */}
      <div className="w-28 flex-shrink-0 flex flex-col gap-1 p-2" style={{borderRight:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="text-xs text-wiki-text3 px-1">画板</div>
        <select value={vp} onChange={e=>setVp(Number(e.target.value))} className="text-xs px-1.5 py-1 rounded outline-none w-full" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text)',border:'1px solid var(--wiki-border)'}}>
          {Object.entries(VP_PRESETS).map(([k,v])=><option key={k} value={v}>{k} ({v}px)</option>)}</select>
        <div className="text-xs text-wiki-text3 px-1 mt-2">缩放</div>
        <div className="flex items-center gap-0.5">
          <button onClick={()=>setZoom(z=>Math.max(25,z-25))} className="flex-1 py-0.5 rounded text-xs hover:bg-wiki-surface2" style={S.text2}>-</button>
          <span className="text-xs text-wiki-text2 w-8 text-center">{zoom}%</span>
          <button onClick={()=>setZoom(z=>Math.min(200,z+25))} className="flex-1 py-0.5 rounded text-xs hover:bg-wiki-surface2" style={S.text2}>+</button>
        </div>
        <div className="text-xs text-wiki-text3 px-1 mt-2">节点</div>
        <div className="text-xs font-medium px-1" style={{color:'var(--wiki-text)'}}>{nodes.length}</div>
        <button onClick={save} disabled={saving} className="mt-auto flex items-center justify-center gap-1 w-full py-1.5 rounded text-xs font-medium" style={{background:'var(--wiki-text)',color:'var(--wiki-bg)'}}><SaveIcon size={10}/>保存</button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto scrollbar-thin" style={{background:gridBg}} tabIndex={0} onKeyDown={handleKeyDown}>
        <div className="flex items-start justify-center p-4">
          <div className="relative">
            <div ref={canvas} className="relative shadow-lg origin-top-left" style={{width:vp,minHeight:700,cursor:tool==='select'?'default':'crosshair',background:isDark?'var(--wiki-bg)':'var(--wiki-surface)',transform:`scale(${zoom/100})`}}
              onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
            {/* Box selection overlay */}
            <div ref={boxRef} className="absolute hidden pointer-events-none z-20" style={{background:'rgba(99,102,241,0.15)',border:'1px dashed #6366f1'}}/>
            {nodes.length===0?<div className="absolute inset-0 flex items-center justify-center text-sm text-wiki-text3">点击顶部工具在画布绘制<br/>或在底部AI对话生成</div>:nodes.map((n:any)=><div key={n.id}>{renderN(n)}{renderHandles(n)}</div>)}
          </div></div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-56 flex-shrink-0 flex flex-col" style={{borderLeft:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="flex border-b" style={{borderColor:'var(--wiki-border)'}}>
          {[{k:'layers',l:'图层'},{k:'code',l:'代码'},{k:'preview',l:'预览'},{k:'plan',l:'计划'}].map((t:any)=>(
            <button key={t.k} onClick={()=>setRightTab(t.k)} className="flex-1 py-2 text-xs font-medium" style={{color:rightTab===t.k?'var(--wiki-text)':'var(--wiki-text3)',borderBottom:rightTab===t.k?'2px solid var(--wiki-text)':'2px solid transparent'}}>{t.l}</button>
          ))}
        </div>
        {rightTab==='layers'?(
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {layers.length===0?<div className="text-xs text-wiki-text3 p-3 text-center">暂无图层</div>:
              layers.map(({node,depth}:any)=>(
                <div key={node.id} onClick={()=>engine.select([node.id],node.id)} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,nodeId:node.id})}}
                  onDoubleClick={()=>{setRenamingId(node.id);setRenameVal(node.name||node.type)}}
                  className="flex items-center gap-1 px-2 py-0.5 cursor-pointer text-xs hover:bg-wiki-surface2 group"
                  style={{paddingLeft:8+depth*12,color:node.id===activeId?'var(--wiki-text)':'var(--wiki-text2)',background:node.id===activeId?'var(--wiki-surface2)':'transparent'}}>
                  <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:node.type==='text'?'#6366f1':node.type==='image'?'#f59e0b':node.type==='ellipse'?'#10b981':node.type==='frame'?'#8b5cf6':'#999'}}/>
                  {renamingId===node.id?(
                    <input autoFocus className="flex-1 px-1 py-0 rounded text-[10px] outline-none" style={S.input}
                      value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter'){engine.updateNode(node.id,{name:renameVal});setRenamingId(null)}else if(e.key==='Escape')setRenamingId(null)}}
                      onBlur={()=>{engine.updateNode(node.id,{name:renameVal});setRenamingId(null)}}/>
                  ):(<span className="truncate flex-1" style={{opacity:node.visible===false?0.4:1,textDecoration:node.locked?'line-through':undefined}}>{node.name||node.type}</span>)}
                  <button onClick={e=>{e.stopPropagation();engine.updateNode(node.id,{visible:!(node.visible!==false)})}}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-wiki-surface flex-shrink-0" title={node.visible===false?'显示':'隐藏'}>
                    {node.visible===false?<EyeOffIcon size={10} style={{color:'var(--wiki-text3)'}}/>:<EyeIcon size={10} style={{color:'var(--wiki-text3)'}}/>}</button>
                  <button onClick={e=>{e.stopPropagation();engine.updateNode(node.id,{locked:!node.locked})}}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-wiki-surface flex-shrink-0" title={node.locked?'解锁':'锁定'}>
                    {node.locked?<LockIcon size={10} style={{color:'#f59e0b'}}/>:<LockIcon size={10} style={{color:'var(--wiki-text3)',opacity:0.4}}/>}</button>
                </div>))}
            </div>
            {activeNode&&<PropertyPanel activeNode={activeNode as any} engine={engine} PALETTE={PALETTE}/>}
            {/* Context menu */}
            {ctxMenu&&<div className="fixed z-[100] py-1 rounded-lg shadow-xl min-w-[120px]" style={{left:ctxMenu.x,top:ctxMenu.y,background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)'}} onClick={()=>setCtxMenu(null)}>
              {[{l:'复制',a:()=>{const nid=engine.documentManager.duplicateNode(ctxMenu.nodeId);if(nid)engine.select([nid],nid);}},{l:'删除',a:()=>{engine.documentManager.removeNode(ctxMenu.nodeId);engine.clearSelection();}},
                {l:'上移一层',a:()=>engine.documentManager.moveNodeUp(ctxMenu.nodeId)},{l:'下移一层',a:()=>engine.documentManager.moveNodeDown(ctxMenu.nodeId)},
                {l:'移至顶层',a:()=>engine.documentManager.moveNodeToTop(ctxMenu.nodeId)},{l:'移至底层',a:()=>engine.documentManager.moveNodeToBottom(ctxMenu.nodeId)},
              ].map(i=>(<button key={i.l} onClick={e=>{e.stopPropagation();i.a();setCtxMenu(null)}} className="w-full text-left px-3 py-1 text-[10px] hover:bg-wiki-surface2" style={{color:'var(--wiki-text2)'}}>{i.l}</button>))}
            </div>}
            {ctxMenu&&<div className="fixed inset-0 z-[99]" onClick={()=>setCtxMenu(null)}/>}
          </div>
        ):rightTab==='code'?(
          <pre className="flex-1 overflow-auto p-3 text-xs font-mono scrollbar-thin" style={{color:'var(--wiki-text2)',whiteSpace:'pre-wrap'}}>{JSON.stringify(nodes,null,2)}</pre>
        ):rightTab==='preview'?(
          <div className="flex-1 relative"><button onClick={()=>setPreviewKey(k=>k+1)} className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded text-[9px]" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>刷新</button>
            <iframe key={previewKey} className="w-full h-full border-0" srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}</style></head><body>${nodes.map((n:any)=>{const s=`position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;background:${Array.isArray(n.fill)?n.fill[0]?.color:n.fill||'transparent'};border-radius:${n.cornerRadius||0}px;${n.layout==='vertical'?'display:flex;flex-direction:column;gap:'+(n.gap||8)+'px;padding:'+(n.padding||16)+'px':''}${n.layout==='horizontal'?'display:flex;gap:'+(n.gap||8)+'px;padding:'+(n.padding||16)+'px':''}`;if(n.type==='text')return`<div style="${s};font-size:${n.fontSize||14}px;font-weight:${n.fontWeight||400};color:${n.color||'#333'};display:flex;align-items:center;background:transparent">${n.content||''}</div>`;if(n.type==='ellipse')return`<div style="${s};border-radius:50%"></div>`;return`<div style="${s}">${(n.children||[]).map((c:any)=>`<div style="position:relative;width:100%;height:auto">${c.type==='text'?`<span style="font-size:${c.fontSize||14}px;font-weight:${c.fontWeight||400};color:${c.color||'#333'}">${c.content||''}</span>`:`<div style="width:${c.width||100}px;height:${c.height||40}px;background:${Array.isArray(c.fill)?c.fill[0]?.color:c.fill||'#ccc'};border-radius:${c.cornerRadius||0}px;margin-bottom:${n.gap||8}px"></div>`}</div>`).join('')}</div>`}).join('')}</body></html>`} />
          </div>
        ):(
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">{plan?<div className="text-xs space-y-2" style={{color:'var(--wiki-text2)',whiteSpace:'pre-wrap'}}>{plan}</div>:<div className="flex items-center justify-center h-full text-xs text-wiki-text3">AI 将在生成前产出设计计划<br/>包含布局、风格、内容层级</div>}</div>
        )}
      </div>
    </div>

    {/* AI bar */}
    {chatOpen && (
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[500px] max-w-[95%] rounded-xl shadow-2xl" style={S.panel}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{borderBottom:'1px solid var(--wiki-border)'}}>
          <SparklesIcon size={11} style={{color:'#6366f1'}}/><span className="text-xs font-medium" style={S.text2}>AI 设计助手</span>
          <button onClick={()=>{setChatOpen(false);setChatMsgs([])}} className="ml-auto p-0.5 rounded hover:bg-wiki-surface2"><XIcon size={11} style={S.text3}/></button>
        </div>
        <div className="max-h-40 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5">
          {chatMsgs.map((m,i)=><div key={i} className={`text-xs ${m.role==='user'?'text-right':''}`}><span className="inline-block px-2 py-0.5 rounded-lg max-w-[85%]" style={{background:m.role==='user'?'var(--wiki-text)':'var(--wiki-surface2)',color:m.role==='user'?'var(--wiki-bg)':'var(--wiki-text2)'}}>{m.content}</span></div>)}
          {aiGen&&<div className="text-xs text-wiki-text3">AI 设计中...</div>}
        </div>
        <div className="flex gap-1.5 px-3 py-2"><select value={styleRef} onChange={e=>setStyleRef(e.target.value)} className="text-[9px] px-1 py-1.5 rounded-lg outline-none flex-shrink-0" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}} title="风格参考"><option value="auto">风格</option><option value="Apple">Apple</option><option value="Airbnb">Airbnb</option><option value="Material">Material</option><option value="Minimal">极简</option><option value="Glassmorphism">玻璃态</option></select>
          <input className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text)',border:'1px solid var(--wiki-border)'}} placeholder="描述设计..." value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();aiGenFn()}}}/>
          <button onClick={aiGenFn} disabled={aiGen||!aiIn.trim()} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-30" style={{background:'var(--wiki-info)',color:'#fff'}}>{aiGen?<RotateCwIcon size={12} className="animate-spin"/>:<SendIcon size={12}/>}</button>
        </div>
      </div>
    )}
    {!chatOpen && (
      <button onClick={()=>setChatOpen(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs transition-all hover:shadow-xl" style={{background:'var(--wiki-surface)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>
        <SparklesIcon size={12} style={{color:'#6366f1'}}/>AI 设计助手
      </button>
    )}
  </div>);
}

// ── Property Panel ──────────────────────────────────────────────────
// Comprehensive property editor for the selected node

function PropertyPanel({activeNode, engine, PALETTE}: {activeNode:any; engine:any; PALETTE:string[]}) {
  const upd = (patch:any) => engine.updateNode(activeNode.id, patch);
  const pos = (patch:any) => engine.setNodePosition(activeNode.id, patch);
  const size = (patch:any) => engine.setNodeSize(activeNode.id, patch);
  const fillColor = Array.isArray(activeNode.fill) ? activeNode.fill[0]?.color : activeNode.fill;
  const hasStroke = !!(activeNode.stroke);
  const hasShadow = Array.isArray(activeNode.effects) && activeNode.effects.some((e:any)=>e.type==='shadow');
  const hasBlur = Array.isArray(activeNode.effects) && activeNode.effects.some((e:any)=>e.type==='blur');
  const canFill = activeNode.type !== 'image' && activeNode.type !== 'group';
  const canStroke = !['group','image'].includes(activeNode.type);
  const canRadius = ['rect','frame','image','ellipse'].includes(activeNode.type);

  const label = (text:string) => <div className="text-[10px] font-medium mb-1" style={{color:'var(--wiki-text3)'}}>{text}</div>;
  const num = (val:number, onChange:(v:number)=>void, opts?:{min?:number;max?:number;step?:number}) =>
    <input type="number" className="w-full px-1.5 py-0.5 rounded text-[10px] outline-none"
      style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text)'}}
      value={val} min={opts?.min} max={opts?.max} step={opts?.step||1}
      onChange={e=>onChange(Number(e.target.value))}/>;

  return (
    <div className="border-t overflow-y-auto scrollbar-thin flex-1" style={{borderColor:'var(--wiki-border)'}}>
      <div className="p-2 space-y-2.5">
        <div className="text-[10px] font-semibold" style={S.text2}>属性 · {activeNode.type}</div>

        {/* Position & Size */}
        <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
          <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>变换</legend>
          <div className="flex gap-1"><div className="flex-1">{label('X')}{num(activeNode.x, v=>pos({x:v}))}</div><div className="flex-1">{label('Y')}{num(activeNode.y, v=>pos({y:v}))}</div></div>
          <div className="flex gap-1 mt-1"><div className="flex-1">{label('宽')}{num(activeNode.width, v=>size({width:Math.max(1,v)}))}</div><div className="flex-1">{label('高')}{num(activeNode.height, v=>size({height:Math.max(1,v)}))}</div></div>
          <div className="flex gap-1 mt-1"><div className="flex-1">{label('旋转')}{num(activeNode.rotation||0, v=>upd({rotation:v}),{min:-360,max:360})}</div><div className="flex-1">{label('不透明度')}{num(Math.round((activeNode.opacity??1)*100), v=>upd({opacity:v/100}),{min:0,max:100,step:5})}</div></div>
        </fieldset>

        {/* Fill */}
        {canFill && (
          <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
            <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>填充</legend>
            <div className="flex flex-wrap gap-1">{PALETTE.slice(0,12).map(c=>(
              <button key={c} onClick={()=>upd({fill:[{type:'solid',color:c}]})}
                className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                style={{background:c,border:fillColor===c?'2px solid var(--wiki-text)':'1px solid var(--wiki-border)'}}/>))}</div>
            <div className="flex gap-1 mt-1">
              <input type="text" placeholder="#000000" className="flex-1 px-1.5 py-0.5 rounded text-[10px] outline-none"
                style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text)'}}
                value={fillColor||''} onChange={e=>upd({fill:[{type:'solid',color:e.target.value}]})}/>
              <button onClick={()=>upd({fill:[]})} className="px-1.5 py-0.5 rounded text-[10px]" style={{color:'var(--wiki-text3)',background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)'}}>清除</button>
            </div>
          </fieldset>
        )}

        {/* Stroke */}
        {canStroke && (
          <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
            <legend className="text-[9px] px-1 flex items-center gap-1" style={{color:'var(--wiki-text3)'}}>
              描边
              <button onClick={()=>upd({stroke:activeNode.stroke?undefined:{color:'#666',width:1}})}
                className="text-[8px] px-1 rounded" style={{background:hasStroke?'var(--wiki-surface2)':'var(--wiki-text)',color:hasStroke?'var(--wiki-text3)':'var(--wiki-bg)'}}>
                {hasStroke?'关闭':'开启'}
              </button>
            </legend>
            {hasStroke && <>
              <div className="flex gap-1">{PALETTE.slice(0,8).map(c=>(<button key={c} onClick={()=>upd({stroke:{...activeNode.stroke,color:c}})}
                className="w-3.5 h-3.5 rounded-sm" style={{background:c,border:activeNode.stroke?.color===c?'2px solid var(--wiki-text)':'1px solid var(--wiki-border)'}}/>))}</div>
              <div className="mt-1">{label('粗细')}{num(activeNode.stroke?.width||1, v=>upd({stroke:{...activeNode.stroke,width:v}}),{min:1,max:20})}</div>
            </>}
          </fieldset>
        )}

        {/* Effects */}
        <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
          <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>效果</legend>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{color:hasShadow?'var(--wiki-text)':'var(--wiki-text3)'}}>
              <input type="checkbox" checked={hasShadow} className="w-3 h-3"
                onChange={()=>{const ef=activeNode.effects||[];upd({effects:hasShadow?ef.filter((e:any)=>e.type!=='shadow'):[...ef,{type:'shadow',color:'rgba(0,0,0,0.2)',offsetX:0,offsetY:2,blur:8}]})}}/>阴影
            </label>
            <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{color:hasBlur?'var(--wiki-text)':'var(--wiki-text3)'}}>
              <input type="checkbox" checked={hasBlur} className="w-3 h-3"
                onChange={()=>{const ef=activeNode.effects||[];upd({effects:hasBlur?ef.filter((e:any)=>e.type!=='blur'):[...ef,{type:'blur',value:'blur(4px)'}]})}}/>模糊
            </label>
          </div>
        </fieldset>

        {/* Corner Radius */}
        {canRadius && (
          <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
            <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>圆角</legend>
            {label('圆角半径')}{num(activeNode.cornerRadius||0, v=>upd({cornerRadius:v}),{min:0,max:100})}
          </fieldset>
        )}

        {/* Layout (Frame only) */}
        {activeNode.type==='frame'&&(
          <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
            <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>布局</legend>
            <div className="flex gap-1">{label('方向')}
              <select className="flex-1 px-1 py-0.5 rounded text-[10px] outline-none" style={S.input}
                value={activeNode.layout||'none'} onChange={e=>upd({layout:e.target.value})}>
                <option value="none">自由</option><option value="vertical">垂直</option><option value="horizontal">水平</option>
              </select></div>
            <div className="flex gap-1 mt-1"><div className="flex-1">{label('间距')}{num(activeNode.gap||0, v=>upd({gap:v}))}</div><div className="flex-1">{label('内边距')}{num(typeof activeNode.padding==='number'?activeNode.padding:16, v=>upd({padding:v}))}</div></div>
          </fieldset>
        )}

        {/* Text Properties */}
        {activeNode.type==='text'&&(
          <fieldset className="rounded border p-1.5" style={{borderColor:'var(--wiki-border)'}}>
            <legend className="text-[9px] px-1" style={{color:'var(--wiki-text3)'}}>文本</legend>
            {label('内容')}<textarea className="w-full px-1.5 py-0.5 rounded text-[10px] outline-none resize-y" rows={2}
              style={S.input} value={activeNode.content||''}
              onChange={e=>upd({content:e.target.value})}/>
            <div className="flex gap-1 mt-1"><div className="flex-1">{label('字号')}{num(activeNode.fontSize||14, v=>upd({fontSize:v}),{min:8,max:200})}</div><div className="flex-1">{label('字重')}<select className="w-full px-1 py-0.5 rounded text-[10px] outline-none" style={S.input}
              value={activeNode.fontWeight||400} onChange={e=>upd({fontWeight:Number(e.target.value)})}>
              <option value={300}>300 Light</option><option value={400}>400 Reg</option><option value={500}>500 Med</option><option value={600}>600 Semi</option><option value={700}>700 Bold</option></select></div></div>
            <div className="flex gap-1 mt-1"><div className="flex-1">{label('对齐')}<select className="w-full px-1 py-0.5 rounded text-[10px] outline-none" style={S.input}
              value={activeNode.textAlign||'left'} onChange={e=>upd({textAlign:e.target.value})}>
              <option value="left">居左</option><option value="center">居中</option><option value="right">居右</option></select></div><div className="flex-1">{label('行高')}{num(activeNode.lineHeight||1.5, v=>upd({lineHeight:v}),{min:0.5,max:3,step:0.1})}</div></div>
            <div className="mt-1">{label('文字颜色')}<div className="flex flex-wrap gap-1 mt-0.5">{PALETTE.slice(0,8).map(c=>(<button key={c} onClick={()=>upd({color:c})}
              className="w-3.5 h-3.5 rounded-sm" style={{background:c,border:activeNode.color===c||(!activeNode.color&&c==='#333')?'2px solid var(--wiki-text)':'1px solid var(--wiki-border)'}}/>))}</div></div>
          </fieldset>
        )}

        {/* Delete */}
        <button onClick={()=>engine.removeSelected()} className="w-full py-1.5 rounded text-[10px] font-medium"
          style={{background:'rgba(239,68,68,0.12)',color:'#ef4444'}}>
          <TrashIcon size={10} className="inline"/> 删除节点
        </button>
      </div>
    </div>
  );
}

// ── Create View (engine-powered) ──
function DesignCreator({onClose}:{onClose:()=>void}) {
  return <DesignProvider><CreatorInner onClose={onClose}/></DesignProvider>;
}

function CreatorInner({onClose}:{onClose:()=>void}) {
  const engine=useDesignEngine();
  const doc=useDocument();
  const {activeId}=useSelection();
  const redoState=useHistory();
  const [tool,setTool]=useActiveTool();

  const initialized=useRef(false);
  useEffect(()=>{
    if(initialized.current)return;
    initialized.current=true;
    engine.loadDocument({id:'new_'+Date.now(),name:'新建画板',pages:[{id:'page_1',name:'页面 1',children:[]}]});
  },[engine]);

  const [aiIn,setAiIn]=useState('');const[cat,setCat]=useState('设计稿-网页');
  const [gen,setGen]=useState(false);const[styleRef,setStyleRef]=useState('auto');const[plan,setPlan]=useState('');
  const [title,setTitle]=useState('');const[vp,setVp]=useState(1024);
  const [chatMsgs,setChatMsgs]=useState<{role:string;content:string}[]>([]);
  const [chatOpen,setChatOpen]=useState(false);
  const [zoom,setZoom]=useState(100);
  const canvas=useRef<HTMLDivElement>(null);const chatRef=useRef<HTMLDivElement>(null);
  const nodes=doc.pages[0]?.children||[];

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:'smooth'})},[chatMsgs]);

  const snap2=(v:number)=>Math.round(v/16)*16;
  const boxRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<{type:'move'|'resize'|'boxselect'|'draw'|null;startX:number;startY:number;nodeId?:string;handle?:string;origX?:number;origY?:number;origW?:number;origH?:number; _selected?:any[]}>({type:null,startX:0,startY:0});

  const toScene = (clientX:number, clientY:number)=>{const r=canvas.current?.getBoundingClientRect(); if(!r) return {x:0,y:0};const s=zoom/100;return {x:(clientX-r.left)/s, y:(clientY-r.top)/s};};
  const hitTestResize = (sceneX:number, sceneY:number, node:any)=>{
    if(!node||node.locked) return null;
    const H=8,nX=node.x,nY=node.y,nW=node.width,nH=node.height;
    const corners=[{h:'nw',x:nX,y:nY},{h:'ne',x:nX+nW,y:nY},{h:'sw',x:nX,y:nY+nH},{h:'se',x:nX+nW,y:nY+nH}];
    const edges=[{h:'n',x:nX+nW/2,y:nY},{h:'s',x:nX+nW/2,y:nY+nH},{h:'w',x:nX,y:nY+nH/2},{h:'e',x:nX+nW,y:nY+nH/2}];
    for(const c of corners){if(Math.abs(sceneX-c.x)<H&&Math.abs(sceneY-c.y)<H) return c.h;}
    for(const e of edges){if(Math.abs(sceneX-e.x)<H/1.5&&Math.abs(sceneY-e.y)<H/1.5) return e.h;}
    return null;
  };
  const hitTestNode = (sceneX:number, sceneY:number)=>{
    const all=[...nodes].reverse();
    for(const n of all){if(n.visible===false||n.locked) continue;if(sceneX>=n.x&&sceneX<=n.x+n.width&&sceneY>=n.y&&sceneY<=n.y+n.height) return n;}
    return null;
  };
  const handleCvsDown = (e:React.MouseEvent)=>{
    const sc = toScene(e.clientX,e.clientY);
    if(tool!=='select'){dragRef.current={type:'draw',startX:snap2(sc.x),startY:snap2(sc.y)};return;}
    if(activeNode){const h=hitTestResize(sc.x,sc.y,activeNode);if(h){dragRef.current={type:'resize',startX:sc.x,startY:sc.y,nodeId:activeNode.id,handle:h,origX:activeNode.x,origY:activeNode.y,origW:activeNode.width,origH:activeNode.height};return;}}
    const hit=hitTestNode(sc.x,sc.y);
    if(hit){engine.select([hit.id],hit.id);dragRef.current={type:'move',startX:sc.x,startY:sc.y,nodeId:hit.id,origX:hit.x,origY:hit.y,_selected:engine.selectedIds.map((id:string)=>{const n=engine.documentManager.findNodeById(doc.pages[0],id);return n?{id,ox:n.x,oy:n.y}:null;}).filter(Boolean)};return;}
    engine.clearSelection();dragRef.current={type:'boxselect',startX:sc.x,startY:sc.y};
  };
  const handleCvsMove = (e:React.MouseEvent)=>{
    const sc=toScene(e.clientX,e.clientY);const d=dragRef.current;if(!d.type)return;
    if(d.type==='move'&&d.nodeId&&d._selected){const dx=snap2(sc.x-d.startX),dy=snap2(sc.y-d.startY);if(dx===0&&dy===0)return;for(const s of d._selected as any[]){engine.setNodePosition(s.id,{x:snap2(s.ox+dx),y:snap2(s.oy+dy)});}}
    else if(d.type==='resize'&&d.nodeId){const dx=sc.x-d.startX,dy=sc.y-d.startY;let {origX:ox,origY:oy,origW:ow,origH:oh}=d as any;let nx=ox,ny=oy,nw=ow,nh=oh;switch(d.handle){case'se':nw=Math.max(16,ow+dx);nh=Math.max(16,oh+dy);break;case'sw':nx=ox+dx;nw=Math.max(16,ow-dx);nh=Math.max(16,oh+dy);break;case'ne':nw=Math.max(16,ow+dx);nh=Math.max(16,oh-dy);ny=oy+dy;break;case'nw':nx=ox+dx;nw=Math.max(16,ow-dx);ny=oy+dy;nh=Math.max(16,oh-dy);break;case'e':nw=Math.max(16,ow+dx);break;case'w':nx=ox+dx;nw=Math.max(16,ow-dx);break;case's':nh=Math.max(16,oh+dy);break;case'n':ny=oy+dy;nh=Math.max(16,oh-dy);break;}engine.setNodePosition(d.nodeId,{x:snap2(nx),y:snap2(ny)});engine.setNodeSize(d.nodeId,{width:snap2(nw),height:snap2(nh)});}
    else if(d.type==='boxselect'&&boxRef.current){const x1=Math.min(d.startX,sc.x),y1=Math.min(d.startY,sc.y),x2=Math.max(d.startX,sc.x),y2=Math.max(d.startY,sc.y);boxRef.current.style.display='block';boxRef.current.style.left=x1+'px';boxRef.current.style.top=y1+'px';boxRef.current.style.width=(x2-x1)+'px';boxRef.current.style.height=(y2-y1)+'px';}
  };
  const handleCvsUp = (e:React.MouseEvent)=>{
    const d=dragRef.current;
    if(d.type==='draw'){const sc=toScene(e.clientX,e.clientY);engine.createNodeByTool(tool,snap2(sc.x),snap2(sc.y));setTool('select');}
    else if(d.type==='boxselect'){if(boxRef.current)boxRef.current.style.display='none';const sc=toScene(e.clientX,e.clientY);const x1=Math.min(d.startX,sc.x),y1=Math.min(d.startY,sc.y),x2=Math.max(d.startX,sc.x),y2=Math.max(d.startY,sc.y);if(x2-x1>4||y2-y1>4){const ids=nodes.filter((n:any)=>n.x<x2&&n.x+n.width>x1&&n.y<y2&&n.y+n.height>y1).map((n:any)=>n.id);if(ids.length>0)engine.select(ids,ids[0]);}}
    dragRef.current={type:null,startX:0,startY:0};
  };
  const renderHandlesC = (node:any)=>{
    if(activeId!==node.id) return null;const H=8;
    const ps=[{h:'nw',x:node.x,y:node.y,c:'nw-resize'},{h:'ne',x:node.x+node.width,y:node.y,c:'ne-resize'},{h:'sw',x:node.x,y:node.y+node.height,c:'sw-resize'},{h:'se',x:node.x+node.width,y:node.y+node.height,c:'se-resize'},{h:'n',x:node.x+node.width/2,y:node.y,c:'n-resize'},{h:'s',x:node.x+node.width/2,y:node.y+node.height,c:'s-resize'},{h:'w',x:node.x,y:node.y+node.height/2,c:'w-resize'},{h:'e',x:node.x+node.width,y:node.y+node.height/2,c:'e-resize'}];
    return <>{ps.map(p=>(<div key={p.h} className="absolute rounded-full" style={{left:p.x-H/2,top:p.y-H/2,width:H,height:H,background:'#fff',border:'2px solid #6366f1',cursor:p.c,zIndex:10}}/>))}</>;
  };

  const genFn=async()=>{if(!aiIn.trim())return;setChatMsgs(prev=>[...prev,{role:'user',content:aiIn}]);setGen(true);
    const styleNote2=styleRef&&styleRef!=='auto'?` 风格:${styleRef}。`:'';
    const sp=`你是一个设计代码生成器。只输出JSON数组，不要任何其他文字。${styleNote2}画布${vp}x768。每个元素是对象，必含type,x,y,width,height。type可选:frame(可含children+layout+gap+padding),rect,text(含content+fontSize),ellipse,image。颜色:#6366f1/#10b981/#f59e0b/#ef4444/#333/#fff/#f8f9fa/#e5e7eb。圆角8-16。生成完整15-30个元素。示例如:[{"type":"frame","x":0,"y":0,"width":375,"height":768,"fill":"#f8f9fa","children":[{"type":"text","x":40,"y":80,"width":295,"height":28,"content":"Sign In","fontSize":24,"fontWeight":700,"fill":"#333"}]}]。`;
    try{const api=(window as any).electronAPI;if(!api?.chatSend)throw new Error('IPC不可用');
      const r=await api.chatSend({messages:[{role:'user',content:aiIn+(styleRef&&styleRef!=='auto'?` [风格:${styleRef}]`:'')}],systemPrompt:sp,toolsEnabled:false,responseFormat:'json_object'});
      if(!r)throw new Error('无响应');if(r.error)throw new Error(r.error);
      let raw=(r.content||'').trim();if(!raw)throw new Error('AI返回空内容');
      let reply=raw.replace(/```[a-z]*\n?/gi,'').replace(/`/g,'').trim();
      let m=reply.match(/\[[\s\S]*\]/);if(!m)m=reply.match(/\{[\s\S]*\}/);
      if(!m){const lb=reply.lastIndexOf('[');const lc=reply.lastIndexOf('{');const s2=Math.max(lb,lc);if(s2>=0){const sub=reply.substring(s2);const m2=sub.match(/\[[\s\S]*\]/)||sub.match(/\{[\s\S]*\}/);if(m2)m=m2}}
      if(!m)throw new Error('AI未返回JSON，开头: '+raw.substring(0,80));
      let jsonStr=m[0];let parsed;
      try{parsed=JSON.parse(jsonStr)}catch(pe){try{jsonStr=jsonStr.replace(/,\s*([}\]])/g,'$1').replace(/'/g,'"').replace(/([{,]\s*)(\w+)(\s*:)/g,'$1"$2"$3').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');parsed=JSON.parse(jsonStr)}catch{try{jsonStr=jsonStr.replace(/\\(?!["\\/bfnrtu])/g,'\\\\');parsed=JSON.parse(jsonStr)}catch{throw new Error('JSON解析失败: '+pe.message)}}}
      let na=parsed;if(!Array.isArray(parsed)&&parsed&&parsed.nodes&&Array.isArray(parsed.nodes)){if(parsed.plan)setPlan(parsed.plan);na=parsed.nodes}
      if(!Array.isArray(na)||na.length===0)throw new Error('返回的不是有效数组');
      for(const el of na){engine.addNode({...el,id:'ai_'+Date.now()+'_'+Math.random().toString(36).slice(2),name:el.type||'Element',rotation:0,opacity:1,visible:true,locked:false})}
      setTitle(title||aiIn.substring(0,30));setChatMsgs(prev=>[...prev,{role:'assistant',content:'已生成'+na.length+'个节点'}]);toast.success('已生成'+na.length+'个节点');setAiIn('')
    }catch(e){const em=(e as any).message||String(e);setChatMsgs(prev=>[...prev,{role:'assistant',content:'失败: '+em}]);toast.error('生成失败: '+em)}finally{setGen(false)}};

  const save=async()=>{const t=title||'新建画板';try{await apiFetch(API.documents,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t,category:cat,type:'OP',size:'1KB',date:new Date().toISOString().split('T')[0],tags:['AI生成'],featured:false,content:JSON.stringify({version:'1.0',viewport:{width:vp,height:768},children:nodes})})});toast.success('已保存');onClose()}catch{toast.error('保存失败')}};
  const gridBg=`repeating-linear-gradient(0deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px),repeating-linear-gradient(90deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px)`;
  const isDark=typeof document!=='undefined'&&document.documentElement.classList.contains('dark');
  const renderN=(n:any):JSX.Element=>{const isSel=n.id===activeId;const s:React.CSSProperties={position:'absolute',left:n.x,top:n.y,width:n.width,height:n.height,background:Array.isArray(n.fill)?n.fill[0]?.color:n.fill||undefined,borderRadius:n.cornerRadius||0,boxShadow:isSel?'0 0 0 2px #6366f1':undefined,cursor:'pointer',overflow:'hidden',display:n.layout?'flex':'block',flexDirection:n.layout==='vertical'?'column':n.layout==='horizontal'?'row':undefined,gap:n.gap,padding:n.padding};if(n.type==='text')return<div key={n.id} style={{...s,fontSize:n.fontSize||14,color:n.color||(isDark?'#e0e0e0':'#333'),display:'flex',alignItems:'center',background:'transparent'}} onClick={e=>{e.stopPropagation();engine.select([n.id],n.id)}}>{n.content||'Text'}</div>;if(n.type==='ellipse')return<div key={n.id} style={{...s,borderRadius:'50%'}} onClick={e=>{e.stopPropagation();engine.select([n.id],n.id)}}/>;return<div key={n.id} style={s} onClick={e=>{e.stopPropagation();engine.select([n.id],n.id)}}>{n.children?.map(c=>renderN(c))}</div>};
  const activeNode=activeId?engine.documentManager.findNodeById(doc.pages[0],activeId):null;

  return(<div className="flex flex-col h-full">
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{borderBottom:'1px solid var(--wiki-border)'}}>
      <button onClick={onClose} className="p-1 rounded hover:bg-wiki-surface2"><XIcon size={15} style={S.text3}/></button>
      <input className="text-sm font-semibold bg-transparent outline-none w-32" style={{color:'var(--wiki-text)'}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="新建画板"/>
      <select value={cat} onChange={e=>setCat(e.target.value)} className="text-xs px-2 py-1 rounded outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>{['设计稿-网页','设计稿-移动端','设计稿-原型'].map(c=><option key={c} value={c}>{c.replace('设计稿-','')}</option>)}</select>
      <div className="flex items-center gap-0.5 ml-2 rounded-lg p-0.5" style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)'}}>
        {([['select',MoveIcon],['frame',LayersIcon],['rect',SquareIcon],['text',TypeIcon],['ellipse',CircleIcon],['image',ImageIcon]] as any[]).map(([t,I])=>(<button key={t} onClick={()=>setTool(t)} className="p-1 rounded" style={{background:tool===t?'var(--wiki-text)':'transparent',color:tool===t?'var(--wiki-bg)':'var(--wiki-text3)'}}><I size={13}/></button>))}
      </div>
      <select value={vp} onChange={e=>setVp(Number(e.target.value))} className="text-xs px-2 py-1 rounded outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>{Object.entries(VP_PRESETS).map(([k,v])=><option key={k} value={v}>{k} {v}px</option>)}</select>
      <div className="ml-auto flex items-center gap-2"><span className="text-xs text-wiki-text3">{nodes.length}节点</span><button onClick={save} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{background:'var(--wiki-text)',color:'var(--wiki-bg)'}}><SaveIcon size={11}/>保存</button></div>
    </div>
    <div className="flex-1 flex overflow-hidden">
      {/* Zone 1: Left — layers */}
      <div className="w-36 flex-shrink-0 flex flex-col" style={{borderRight:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="text-xs font-medium px-3 py-2 text-wiki-text3 uppercase tracking-wider" style={{borderBottom:'1px solid var(--wiki-border)'}}>图层</div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {nodes.length===0?<div className="text-xs text-wiki-text3 p-3 text-center">暂无图层</div>:
          nodes.map((n,i)=>(<div key={n.id} onClick={()=>engine.select([n.id],n.id)} className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-wiki-surface2" style={{color:n.id===activeId?'var(--wiki-text)':'var(--wiki-text2)',background:n.id===activeId?'var(--wiki-surface2)':'transparent'}}>
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:n.type==='text'?'#6366f1':n.type==='image'?'#f59e0b':n.type==='ellipse'?'#10b981':n.type==='frame'?'#8b5cf6':'#999'}}/>
            <span className="truncate">{n.type} {i+1}</span>
          </div>))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto scrollbar-thin" style={{background:gridBg}}>
        <div className="flex items-start justify-center p-4">
          <div className="relative">
            <div ref={canvas} className="relative shadow-lg origin-top-left" style={{width:vp,minHeight:700,cursor:tool==='select'?'default':'crosshair',background:isDark?'var(--wiki-bg)':'var(--wiki-surface)',transform:`scale(${zoom/100})`}}
              onMouseDown={handleCvsDown} onMouseMove={handleCvsMove} onMouseUp={handleCvsUp} onMouseLeave={handleCvsUp}>
            <div ref={boxRef} className="absolute hidden pointer-events-none z-20" style={{background:'rgba(99,102,241,0.15)',border:'1px dashed #6366f1'}}/>
            {nodes.length===0?<div className="absolute inset-0 flex items-center justify-center text-sm text-wiki-text3">点击顶部工具在画布绘制<br/>或在底部AI对话生成</div>:nodes.map((n:any)=><div key={n.id}>{renderN(n)}{renderHandlesC(n)}</div>)}
          </div></div>
        </div>
      </div>

      {/* Zone 4: Right — style */}
      <div className="w-56 flex-shrink-0 flex flex-col" style={{borderLeft:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="text-xs font-medium px-3 py-2 text-wiki-text3 uppercase tracking-wider" style={{borderBottom:'1px solid var(--wiki-border)'}}>属性</div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {activeNode?<PropertyPanel activeNode={activeNode as any} engine={engine} PALETTE={PALETTE}/>
          :<div className="flex-1 flex items-center justify-center text-xs text-wiki-text3 p-2 text-center">选择元素编辑属性</div>}
        </div>
      </div>
    </div>
    {chatOpen && (
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[480px] max-w-[95%] rounded-xl shadow-2xl" style={S.panel}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{borderBottom:'1px solid var(--wiki-border)'}}><SparklesIcon size={11} style={{color:'#6366f1'}}/><span className="text-xs font-medium" style={S.text2}>AI 设计助手</span><button onClick={()=>{setChatOpen(false);setChatMsgs([])}} className="ml-auto p-0.5 rounded hover:bg-wiki-surface2"><XIcon size={11} style={S.text3}/></button></div>
        <div className="max-h-36 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5">
          {chatMsgs.map((m,i)=><div key={i} className={`text-xs ${m.role==='user'?'text-right':''}`}><span className="inline-block px-2 py-0.5 rounded-lg max-w-[85%]" style={{background:m.role==='user'?'var(--wiki-text)':'var(--wiki-surface2)',color:m.role==='user'?'var(--wiki-bg)':'var(--wiki-text2)'}}>{m.content}</span></div>)}
          {gen&&<div className="text-xs text-wiki-text3">AI 设计中...</div>}
        </div>
        <div className="flex gap-1.5 px-3 py-2"><select value={styleRef} onChange={e=>setStyleRef(e.target.value)} className="text-[9px] px-1 py-1.5 rounded-lg outline-none flex-shrink-0" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}} title="风格参考"><option value="auto">风格</option><option value="Apple">Apple</option><option value="Airbnb">Airbnb</option><option value="Material">Material</option><option value="Minimal">极简</option><option value="Glassmorphism">玻璃态</option></select><input className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text)',border:'1px solid var(--wiki-border)'}} placeholder="描述设计..." value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();genFn()}}}/><button onClick={genFn} disabled={gen||!aiIn.trim()} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-30" style={{background:'var(--wiki-info)',color:'#fff'}}>{gen?<RotateCwIcon size={12} className="animate-spin"/>:<SendIcon size={12}/>}</button></div>
      </div>
    )}
    {!chatOpen && (
      <button onClick={()=>setChatOpen(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-xs transition-all hover:shadow-xl" style={{background:'var(--wiki-surface)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>
        <SparklesIcon size={12} style={{color:'#6366f1'}}/>AI 设计助手
      </button>
    )}
  </div>);
}
// ── SVG Export / Import utilities ──────────────────────────────────

function exportAsSVG(nodes: any[]): string {
  const parts: string[] = [];
  const renderSVG = (n: any) => {
    const fill = Array.isArray(n.fill) ? n.fill[0]?.color : n.fill;
    const style = `fill:${fill||'none'};opacity:${n.opacity??1}`;
    switch(n.type){
      case'rect':parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.cornerRadius||0}" style="${style}"/>`);break;
      case'ellipse':parts.push(`<ellipse cx="${n.x+n.width/2}" cy="${n.y+n.height/2}" rx="${n.width/2}" ry="${n.height/2}" style="${style}"/>`);break;
      case'text':parts.push(`<text x="${n.x}" y="${n.y+n.fontSize||16}" font-size="${n.fontSize||14}" font-weight="${n.fontWeight||400}" fill="${n.color||'#333'}" style="font-family:${n.fontFamily||'system-ui'}">${n.content||''}</text>`);break;
      case'frame':parts.push(`<g transform="translate(${n.x},${n.y})">`);if(n.children)n.children.forEach(renderSVG);parts.push('</g>');break;
      case'group':if(n.children)n.children.forEach(renderSVG);break;
      case'image':if(n.src)parts.push(`<image x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" href="${n.src}"/>`);break;
    }
  };
  nodes.forEach(renderSVG);
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${parts.join('\n')}\n</svg>`;
}

function parseSVGNodes(svgString: string): any[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const nodes: any[] = [];
  const parseElement = (el: Element): any | null => {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y2 = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '100');
    const h = parseFloat(el.getAttribute('height') || '100');
    const fill = el.getAttribute('fill') || '#ccc';
    const rx = parseFloat(el.getAttribute('rx') || '0');
    const tag = el.tagName;
    if(tag==='rect') return {id:'svg_'+Date.now()+'_'+Math.random().toString(36).slice(2),type:'rect',name:'Rectangle',x,y2,width:w,height:h,rotation:0,opacity:1,visible:true,locked:false,cornerRadius:rx,fill:[{type:'solid',color:fill}]};
    if(tag==='ellipse'||tag==='circle') {const cx=parseFloat(el.getAttribute('cx')||'50');const cy=parseFloat(el.getAttribute('cy')||'50');const r=parseFloat(el.getAttribute('r')||'25');return {id:'svg_'+Date.now()+'_'+Math.random().toString(36).slice(2),type:'ellipse',name:'Ellipse',x:cx-r,y:cy-r,width:r*2,height:r*2,rotation:0,opacity:1,visible:true,locked:false,fill:[{type:'solid',color:fill}]}}
    if(tag==='text') return {id:'svg_'+Date.now()+'_'+Math.random().toString(36).slice(2),type:'text',name:'Text',x,y2,width:w||200,height:h||24,rotation:0,opacity:1,visible:true,locked:false,content:el.textContent||'',fontSize:parseFloat(el.getAttribute('font-size')||'14'),color:fill};
    return null;
  };
  doc.querySelectorAll('rect, ellipse, circle, text').forEach(el => {
    const n = parseElement(el);
    if(n) nodes.push(n);
  });
  return nodes;
}
