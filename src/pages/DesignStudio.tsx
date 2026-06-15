import { apiFetch, API } from '../api';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  PlusIcon, GridIcon, ListIcon, TrashIcon, XIcon, SparklesIcon, SendIcon,
  RotateCwIcon, MonitorIcon, SmartphoneIcon, TabletIcon, Edit3Icon, SaveIcon,
  PaletteIcon, SquareIcon, TypeIcon, ImageIcon, CircleIcon, MoveIcon, LayersIcon,
  UploadIcon, EyeIcon, CodeIcon, CopyIcon, ChevronUpIcon, MinusIcon
} from 'lucide-react';
import { toast } from 'sonner';
import UnifiedSidebar, { SidebarItem } from '../components/UnifiedSidebar';
import PageHeader from '../components/PageHeader';
import SearchBar, { FilterPills, type FilterPill } from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

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
  if(tab&&p.initialView==='design-studio-detail'&&p.docId)return<DesignEditor docId={p.docId} onClose={p.onCloseSelf!}/>;
  if(tab&&p.initialView==='design-studio-create')return<DesignCreator onClose={p.onCloseSelf!}/>;
  return (<div className="flex h-full overflow-hidden">
    <UnifiedSidebar open={so} onToggle={()=>setSo(false)} title="分类" actions={<button onClick={openC} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-wiki-surface2"><PlusIcon size={12} style={S.text3}/></button>}>
      <SidebarItem label="全部" active={cat==='all'} onClick={()=>setCat('all')}/>
      {cats.map(c=><SidebarItem key={c} label={c.replace('设计稿-','')} active={cat===c} onClick={()=>setCat(cat===c?'all':c)}/>)}
    </UnifiedSidebar>
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="设计稿" description="基于OpenPencil架构的Agent驱动原型设计画板" sidebarOpen={so} onToggleSidebar={()=>setSo(!so)} actions={<button onClick={openC} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{background:'var(--wiki-accent)',color:'var(--wiki-bg)'}}><PlusIcon size={14}/>新建画板</button>}/>
      <SearchBar value={si} onChange={setSi} placeholder="搜索设计稿..." extra={<button onClick={()=>setVm(vm==='grid'?'list':'grid')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs" style={{background:'var(--wiki-surface)',border:'1px solid var(--wiki-border)',color:'var(--wiki-text2)'}}>{vm==='grid'?<ListIcon size={13}/>:<GridIcon size={13}/>}<span>{vm==='grid'?'列表':'网格'}</span></button>}/>
      <FilterPills items={[{key:'all',label:'全部',color:'var(--wiki-text)'},...cats.map(c=>({key:c,label:c.replace('设计稿-',''),color:CAT_CFG[c.replace('设计稿-','')]?.color||'#888'}))]} activeKey={cat} onChange={setCat}/>
      <div className="overflow-y-auto flex-1 px-8 pb-4" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
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

// ── DesignEditor (5-zone layout) ──
function DesignEditor({docId,onClose}:{docId:number;onClose:()=>void}) {
  const [title,setTitle]=useState('');
  const [nodes,setNodes]=useState<DesignNode[]>([]);
  const [sel,setSel]=useState<string|null>(null);
  const [vp,setVp]=useState(1024);
  const [tool,setTool]=useState<'select'|'frame'|'rect'|'text'|'ellipse'|'image'>('select');
  const [sideTab,setSideTab]=useState<'pages'|'layers'>('layers');
  const [rightTab,setRightTab]=useState<'layers'|'code'|'preview'|'plan'>('layers'); const [plan,setPlan]=useState(''); const [previewKey,setPreviewKey]=useState(0); const [styleRef,setStyleRef]=useState('auto');
  const [aiIn,setAiIn]=useState('');
  const [aiGen,setAiGen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [zoom,setZoom]=useState(100);
  const [chatOpen,setChatOpen]=useState(false);
  const [chatMsgs,setChatMsgs]=useState<{role:string;content:string}[]>([]);
  const canvas=useRef<HTMLDivElement>(null);
  const fileInp=useRef<HTMLInputElement>(null);
  const chatRef=useRef<HTMLDivElement>(null);
  const selNode=nodes.find(n=>n.id===sel);

  useEffect(()=>{apiFetch(API.documentsById(docId)).then(r=>r.json()).then((d:DesignDoc)=>{setTitle(d.title);try{const p=JSON.parse(d.content||'{}');setNodes(p.children||p.elements||[])}catch{}}).catch(()=>toast.error('加载失败'))},[docId]);
  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:'smooth'})},[chatMsgs]);

  const snap=(v:number)=>Math.round(v/16)*16;
  const handleClick=(e:React.MouseEvent)=>{if(tool==='select'){setSel(null);return}const r=canvas.current?.getBoundingClientRect();if(!r)return;const s=zoom/100;const x=snap(Math.round((e.clientX-r.left)/s)),y=snap(Math.round((e.clientY-r.top)/s));const defs:Record<string,DesignNode>={frame:{id:'n_'+Date.now(),type:'frame',x,y,width:320,height:208,fill:'#f8f9fa',cornerRadius:8,layout:'vertical',gap:12,padding:16},rect:{id:'n_'+Date.now(),type:'rect',x,y,width:128,height:64,fill:'#6366f1',cornerRadius:8},text:{id:'n_'+Date.now(),type:'text',x,y,width:208,height:32,content:'文本',fontSize:16,fill:'#333'},ellipse:{id:'n_'+Date.now(),type:'ellipse',x,y,width:80,height:80,fill:'#10b981'},image:{id:'n_'+Date.now(),type:'image',x,y,width:208,height:160,fill:'#e5e7eb',cornerRadius:8}};const n=defs[tool]||defs.rect;setNodes(prev=>[...prev,n]);setSel(n.id);setTool('select')};
  const delNode=(id:string)=>{setNodes(prev=>prev.filter(n=>n.id!==id));if(sel===id)setSel(null)};
  const moveNode=(id:string,dx:number,dy:number)=>{setNodes(prev=>prev.map(n=>n.id===id?{...n,x:n.x+dx,y:n.y+dy}:n))};
  const updNode=(id:string,p:Partial<DesignNode>)=>{setNodes(prev=>prev.map(n=>n.id===id?{...n,...p}:n))};

  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(!sel||(e.target as HTMLElement)?.tagName==='INPUT'||(e.target as HTMLElement)?.tagName==='TEXTAREA')return;const s=e.shiftKey?10:1;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();delNode(sel);return}const m:Record<string,[number,number]>={ArrowUp:[0,-s],ArrowDown:[0,s],ArrowLeft:[-s,0],ArrowRight:[s,0]};const mv=m[e.key];if(mv){e.preventDefault();moveNode(sel,mv[0],mv[1])}};window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h)},[sel]);

  const aiGenFn=async()=>{if(!aiIn.trim())return;setChatMsgs(prev=>[...prev,{role:'user',content:aiIn}]);setAiGen(true);const ctx=nodes.length>0?`\n当前节点:${JSON.stringify(nodes)}`:'';
    const styleNote=styleRef&&styleRef!=='auto'?` 风格:${styleRef}。`:'';const sp=`你是一个设计代码生成器。只输出JSON数组，不要任何其他文字。${styleNote}画布${vp}x768。每个元素是对象，必含type,x,y,width,height。type可选:frame(可含children+layout+gap+padding),rect,text(含content+fontSize),ellipse,image。颜色:#6366f1/#10b981/#f59e0b/#ef4444/#333/#fff/#f8f9fa/#e5e7eb。圆角8-16。示例如:[{"type":"frame","x":0,"y":0,"width":375,"height":768,"fill":"#f8f9fa","children":[{"type":"text","x":40,"y":60,"width":295,"height":28,"content":"Welcome","fontSize":24,"fontWeight":700,"fill":"#333"}]}]。${ctx}`;
    try{const api=(window as any).electronAPI;if(!api?.chatSend)throw new Error('IPC不可用，请重启');const r=await api.chatSend({messages:[{role:'user',content:aiIn+(styleRef&&styleRef!=='auto'?` [风格:${styleRef}]`:'')}],systemPrompt:sp,toolsEnabled:false,responseFormat:'json_object'});if(!r)throw new Error('无响应');if(r.error)throw new Error(r.error);let raw=(r.content||'').trim();if(!raw)throw new Error('AI返回空内容');let reply=raw.replace(/```[a-z]*\n?/gi,'').replace(/`/g,'').trim();let m=reply.match(/\[[\s\S]*\]/);if(!m)m=reply.match(/\{[\s\S]*\}/);if(!m){const lastBracket=reply.lastIndexOf('[');const lastBrace=reply.lastIndexOf('{');const start=Math.max(lastBracket,lastBrace);if(start>=0){const sub=reply.substring(start);const m2=sub.match(/\[[\s\S]*\]/)||sub.match(/\{[\s\S]*\}/);if(m2)m=m2}}if(!m)throw new Error('AI未返回JSON，开头: '+raw.substring(0,80));let jsonStr=m[0];let parsed;try{parsed=JSON.parse(jsonStr)}catch(pe){try{jsonStr=jsonStr.replace(/,\s*([}\]])/g,'$1').replace(/'/g,'"').replace(/([{,]\s*)(\w+)(\s*:)/g,'$1"$2"$3').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');parsed=JSON.parse(jsonStr)}catch{try{jsonStr=jsonStr.replace(/\\(?!["\\/bfnrtu])/g,'\\\\');parsed=JSON.parse(jsonStr)}catch{throw new Error('JSON解析失败: '+pe.message)}}}let na=parsed;if(!Array.isArray(parsed)&&parsed&&parsed.nodes&&Array.isArray(parsed.nodes)){if(parsed.plan)setPlan(parsed.plan);na=parsed.nodes}if(!Array.isArray(na)||na.length===0)throw new Error('返回的不是有效数组');const fresh=na.map((el,i:any)=>({...el,id:'ai_'+Date.now()+'_'+i}));setNodes(aiIn.includes('修改')?[...nodes,...fresh]:fresh);setChatMsgs(prev=>[...prev,{role:'assistant',content:'已生成'+fresh.length+'个节点'}]);toast.success('已'+(aiIn.includes('修改')?'添加':'生成')+fresh.length+'个节点');setAiIn('')}catch(e){const em=(e as any).message||String(e);setChatMsgs(prev=>[...prev,{role:'assistant',content:'生成失败: '+em}]);toast.error('生成失败: '+em)}finally{setAiGen(false)}};

  const save=async()=>{setSaving(true);try{await apiFetch(API.documentsById(docId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,category:'设计稿-原型',content:JSON.stringify({version:'1.0',viewport:{width:vp,height:768},children:nodes})})});toast.success('已保存')}catch{toast.error('保存失败')}finally{setSaving(false)}};

  // Grid background CSS
  const gridBg = `repeating-linear-gradient(0deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px),repeating-linear-gradient(90deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px)`;
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  // Recursive node renderer
  const renderN=(n:DesignNode):JSX.Element=>{const isSel=sel===n.id;const s:React.CSSProperties={position:'absolute',left:n.x,top:n.y,width:n.width,height:n.height,background:n.fill||undefined,opacity:n.opacity??1,borderRadius:n.cornerRadius||0,border:n.stroke?`${n.stroke} solid`:undefined,boxShadow:isSel?'0 0 0 2px #6366f1':(n.effects?.find(e=>e.type==='shadow')?.value||undefined),transform:n.rotation?`rotate(${n.rotation}deg)`:undefined,cursor:'pointer',overflow:'hidden',display:n.layout?'flex':'block',flexDirection:n.layout==='vertical'?'column':n.layout==='horizontal'?'row':undefined,gap:n.gap||undefined,padding:n.padding||undefined,alignItems:n.layout?'flex-start':undefined};
    const click=(e:React.MouseEvent)=>{e.stopPropagation();setSel(n.id)};
    if(n.type==='text')return<div key={n.id} style={{...s,fontSize:n.fontSize||14,fontWeight:n.fontWeight||400,fontFamily:n.fontFamily||'system-ui',textAlign:n.textAlign||'left',display:'flex',alignItems:'center',background:'transparent',color:n.fill||(isDark?'#e0e0e0':'#333')}} onClick={click}>{n.content||'Text'}</div>;
    if(n.type==='image')return<div key={n.id} style={{...s,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={click}>{n.src?<img src={n.src} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>:<ImageIcon size={24} style={{color:'#ccc'}}/>}</div>;
    if(n.type==='ellipse')return<div key={n.id} style={{...s,borderRadius:'50%'}} onClick={click}/>;
    return<div key={n.id} style={s} onClick={click}>{n.children?.map(c=>renderN(c))}</div>};

  // Flatten layer list
  const flatten=(ns:DesignNode[],depth=0):{node:DesignNode;depth:number}[]=>{let r:{node:DesignNode;depth:number}[]=[];for(const n of ns){r.push({node:n,depth});if(n.children)r=r.concat(flatten(n.children,depth+1))}return r};
  const layers=flatten(nodes);

  return(<div className="flex flex-col h-full">
    {/* Zone 3: Top toolbar */}
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{borderBottom:'1px solid var(--wiki-border)'}}>
      <button onClick={onClose} className="p-1 rounded hover:bg-wiki-surface2"><XIcon size={15} style={S.text3}/></button>
      <input className="text-sm font-semibold bg-transparent outline-none w-40" style={{color:'var(--wiki-text)'}} value={title} onChange={e=>setTitle(e.target.value)}/>
      <div className="w-px h-5 mx-1" style={{background:'var(--wiki-border)'}}/>
      <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)'}}>
        {([['select',MoveIcon],['frame',LayersIcon],['rect',SquareIcon],['text',TypeIcon],['ellipse',CircleIcon],['image',ImageIcon]] as any[]).map(([t,I])=>(
          <button key={t} onClick={()=>setTool(t)} className="p-1 rounded" style={{background:tool===t?'var(--wiki-text)':'transparent',color:tool===t?'var(--wiki-bg)':'var(--wiki-text3)'}} title={t}><I size={13}/></button>))}
      </div>
      <select value={vp} onChange={e=>setVp(Number(e.target.value))} className="text-xs px-2 py-1 rounded outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>
        {Object.entries(VP_PRESETS).map(([k,v])=><option key={k} value={v}>{k} {v}px</option>)}</select>
      <button onClick={()=>setZoom(z=>Math.max(25,z-25))} className="text-xs px-1.5 py-0.5 rounded hover:bg-wiki-surface2" style={S.text2}>-</button>
      <span className="text-xs text-wiki-text2 w-8 text-center">{zoom}%</span>
      <button onClick={()=>setZoom(z=>Math.min(200,z+25))} className="text-xs px-1.5 py-0.5 rounded hover:bg-wiki-surface2" style={S.text2}>+</button>
      <input type="file" ref={fileInp} accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setNodes(prev=>[...prev,{id:'img_'+Date.now(),type:'image',x:100,y:100,width:200,height:150,src:ev.target?.result as string,cornerRadius:8}]);toast.success('已导入')};r.readAsDataURL(f);e.target.value=''}}/>
      <button onClick={()=>fileInp.current?.click()} className="p-1 rounded hover:bg-wiki-surface2" title="导入图片"><UploadIcon size={13} style={S.text3}/></button>
      <div className="ml-auto flex items-center gap-2"><span className="text-xs text-wiki-text3">{nodes.length}节点</span><button onClick={save} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium" style={{background:'var(--wiki-text)',color:'var(--wiki-bg)'}}><SaveIcon size={11}/>保存</button></div>
    </div>

    <div className="flex-1 flex overflow-hidden">
      {/* Zone 1: Left — compact canvas controls */}
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
      <div className="flex-1 overflow-auto scrollbar-thin" style={{background:gridBg}}>
        <div className="flex items-start justify-center p-4">
          <div className="relative">
            <div ref={canvas} className="relative shadow-lg origin-top-left" style={{width:vp,minHeight:700,cursor:tool==='select'?'default':'crosshair',background:isDark?'var(--wiki-bg)':'var(--wiki-surface)',transform:`scale(${zoom/100})`}} onClick={handleClick}>
            {nodes.length===0?<div className="absolute inset-0 flex items-center justify-center text-sm text-wiki-text3">点击顶部工具在画布绘制<br/>或在底部AI对话生成</div>:nodes.map(n=>renderN(n))}
          </div></div>
        </div>
      </div>

      {/* Zone 4: Right — style + code preview */}
      <div className="w-52 flex-shrink-0 flex flex-col" style={{borderLeft:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="flex border-b" style={{borderColor:'var(--wiki-border)'}}>
          {[{k:'layers',l:'图层'},{k:'code',l:'代码'},{k:'preview',l:'预览'},{k:'plan',l:'计划'}].map((t:any)=>(
            <button key={t.k} onClick={()=>setRightTab(t.k)} className="flex-1 py-2 text-xs font-medium" style={{color:rightTab===t.k?'var(--wiki-text)':'var(--wiki-text3)',borderBottom:rightTab===t.k?'2px solid var(--wiki-text)':'2px solid transparent'}}>{t.l}</button>
          ))}
        </div>
        {rightTab==='layers'?(
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {layers.length===0?<div className="text-xs text-wiki-text3 p-3 text-center">暂无图层</div>:
              layers.map(({node,depth})=>(
                <div key={node.id} onClick={()=>setSel(node.id)} className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-wiki-surface2"
                  style={{paddingLeft:8+depth*12,color:sel===node.id?'var(--wiki-text)':'var(--wiki-text2)',background:sel===node.id?'var(--wiki-surface2)':'transparent'}}>
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:node.type==='text'?'#6366f1':node.type==='image'?'#f59e0b':node.type==='ellipse'?'#10b981':node.type==='frame'?'#8b5cf6':'#999'}}/>
                  <span className="truncate">{node.name||node.type}{node.role?` ·${node.role}`:''}</span>
                </div>))}
            </div>
            {selNode&&<div className="border-t overflow-y-auto scrollbar-thin" style={{borderColor:'var(--wiki-border)',maxHeight:'50%'}}>
              <div className="p-2 space-y-2">
                <div className="text-xs font-medium" style={S.text2}>属性 {selNode.type}</div>
                <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">X</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.x} onChange={e=>updNode(selNode.id,{x:Number(e.target.value)})}/></div>
                <div className="flex-1"><div className="text-[9px] text-wiki-text3">Y</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.y} onChange={e=>updNode(selNode.id,{y:Number(e.target.value)})}/></div></div>
                <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">W</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.width} onChange={e=>updNode(selNode.id,{width:Number(e.target.value)})}/></div>
                <div className="flex-1"><div className="text-[9px] text-wiki-text3">H</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.height} onChange={e=>updNode(selNode.id,{height:Number(e.target.value)})}/></div></div>
                {selNode.type==='text'&&<>
                  <div><div className="text-[9px] text-wiki-text3">内容</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} value={selNode.content||''} onChange={e=>updNode(selNode.id,{content:e.target.value})}/></div>
                  <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">字号</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" type="number" style={S.input} value={selNode.fontSize||14} onChange={e=>updNode(selNode.id,{fontSize:Number(e.target.value)})}/></div>
                  <div className="flex-1"><div className="text-[9px] text-wiki-text3">字重</div><select className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} value={selNode.fontWeight||400} onChange={e=>updNode(selNode.id,{fontWeight:Number(e.target.value)})}><option value={300}>300</option><option value={400}>400</option><option value={600}>600</option><option value={700}>700</option></select></div></div>
                </>}
                <div><div className="text-[9px] text-wiki-text3">颜色</div><div className="flex flex-wrap gap-0.5 mt-0.5">{PALETTE.slice(0,10).map(c=><button key={c} onClick={()=>updNode(selNode.id,{fill:c})} className="w-3.5 h-3.5 rounded-sm" style={{background:c,border:selNode.fill===c?'2px solid var(--wiki-text)':'1px solid var(--wiki-border)'}}/>)}</div></div>
                <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">圆角</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" type="number" style={S.input} value={selNode.cornerRadius||0} onChange={e=>updNode(selNode.id,{cornerRadius:Number(e.target.value)})}/></div>
                {selNode.type==='frame'&&<><div className="flex-1"><div className="text-[9px] text-wiki-text3">间距</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" type="number" style={S.input} value={selNode.gap||8} onChange={e=>updNode(selNode.id,{gap:Number(e.target.value)})}/></div></>}</div>
                <button onClick={()=>delNode(selNode.id)} className="w-full py-1 rounded text-xs font-medium" style={{background:'rgba(239,68,68,0.12)',color:'#ef4444'}}><TrashIcon size={10} className="inline"/> 删除</button>
              </div>
            </div>}
          </div>
        ):rightTab==='code'?(
          <pre className="flex-1 overflow-auto p-3 text-xs font-mono scrollbar-thin" style={{color:'var(--wiki-text2)',whiteSpace:'pre-wrap'}}>{JSON.stringify(nodes,null,2)}</pre>
        ):rightTab==='preview'?(
          <div className="flex-1 relative"><button onClick={()=>setPreviewKey(k=>k+1)} className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded text-[9px]" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>刷新</button>
            <iframe key={previewKey} className="w-full h-full border-0" srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}</style></head><body>${nodes.map(n=>{const s=`position:absolute;left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;background:${n.fill||'transparent'};border-radius:${n.cornerRadius||0}px;${n.layout==='vertical'?'display:flex;flex-direction:column;gap:'+(n.gap||8)+'px;padding:'+(n.padding||16)+'px':''}${n.layout==='horizontal'?'display:flex;gap:'+(n.gap||8)+'px;padding:'+(n.padding||16)+'px':''}`;if(n.type==='text')return`<div style="${s};font-size:${n.fontSize||14}px;font-weight:${n.fontWeight||400};color:${n.fill||'#333'};display:flex;align-items:center;background:transparent">${n.content||''}</div>`;if(n.type==='ellipse')return`<div style="${s};border-radius:50%"></div>`;return`<div style="${s}">${(n.children||[]).map((c:any)=>`<div style="position:relative;width:100%;height:auto">${c.type==='text'?`<span style="font-size:${c.fontSize||14}px;font-weight:${c.fontWeight||400};color:${c.fill||'#333'}">${c.content||''}</span>`:`<div style="width:${c.width||100}px;height:${c.height||40}px;background:${c.fill||'#ccc'};border-radius:${c.cornerRadius||0}px;margin-bottom:${n.gap||8}px"></div>`}</div>`).join('')}</div>`}).join('')}</body></html>`} />
          </div>
        ):(
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">{plan?<div className="text-xs space-y-2" style={{color:'var(--wiki-text2)',whiteSpace:'pre-wrap'}}>{plan}</div>:<div className="flex items-center justify-center h-full text-xs text-wiki-text3">AI 将在生成前产出设计计划<br/>包含布局、风格、内容层级</div>}</div>
        )}
      </div>
    </div>

    {/* Zone 5: Floating AI bar over canvas */}
    {chatOpen && (
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[500px] max-w-[95%] rounded-xl shadow-2xl" style={S.panel}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{borderBottom:'1px solid var(--wiki-border)'}}>
          <SparklesIcon size={11} style={{color:'#6366f1'}}/>
          <span className="text-xs font-medium" style={S.text2}>AI 设计助手</span>
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

// ── Create View ──
function DesignCreator({onClose}:{onClose:()=>void}) {
  const [aiIn,setAiIn]=useState('');const[cat,setCat]=useState('设计稿-网页');
  const [gen,setGen]=useState(false);const[nodes,setNodes]=useState<DesignNode[]>([]);
  const [styleRef,setStyleRef]=useState('auto');const [plan,setPlan]=useState('');
  const [title,setTitle]=useState('');const[vp,setVp]=useState(1024);
  const [tool,setTool]=useState<'select'|'frame'|'rect'|'text'|'ellipse'|'image'>('select');
  const [sel,setSel]=useState<string|null>(null);
  const [chatMsgs,setChatMsgs]=useState<{role:string;content:string}[]>([]);
  const [chatOpen,setChatOpen]=useState(false);
  const [zoom,setZoom]=useState(100);
  const canvas=useRef<HTMLDivElement>(null);const chatRef=useRef<HTMLDivElement>(null);
  const selNode=nodes.find(n=>n.id===sel);

  useEffect(()=>{chatRef.current?.scrollIntoView({behavior:'smooth'})},[chatMsgs]);

  const snap2=(v:number)=>Math.round(v/16)*16;
  const handleClick=(e:React.MouseEvent)=>{if(tool==='select'){setSel(null);return}const r=canvas.current?.getBoundingClientRect();if(!r)return;const s=zoom/100;const x=snap2(Math.round((e.clientX-r.left)/s)),y=snap2(Math.round((e.clientY-r.top)/s));const defs:any={frame:{id:'n_'+Date.now(),type:'frame',x,y,width:320,height:208,fill:'#f8f9fa',cornerRadius:8,layout:'vertical',gap:12,padding:16},rect:{id:'n_'+Date.now(),type:'rect',x,y,width:128,height:64,fill:'#6366f1',cornerRadius:8},text:{id:'n_'+Date.now(),type:'text',x,y,width:208,height:32,content:'文本',fontSize:16,fill:'#333'},ellipse:{id:'n_'+Date.now(),type:'ellipse',x,y,width:80,height:80,fill:'#10b981'}};const n=defs[tool]||defs.rect;setNodes(prev=>[...prev,n]);setSel(n.id);setTool('select')};
  const delNode=(id:string)=>{setNodes(prev=>prev.filter(n=>n.id!==id));if(sel===id)setSel(null)};
  const updNode=(id:string,p:Partial<DesignNode>)=>{setNodes(prev=>prev.map(n=>n.id===id?{...n,...p}:n))};

  const genFn=async()=>{if(!aiIn.trim())return;setChatMsgs(prev=>[...prev,{role:'user',content:aiIn}]);setGen(true);
    const styleNote2=styleRef&&styleRef!=='auto'?` 风格:${styleRef}。`:'';const sp=`你是一个设计代码生成器。只输出JSON数组，不要任何其他文字。${styleNote2}画布${vp}x768。每个元素是对象，必含type,x,y,width,height。type可选:frame(可含children+layout+gap+padding),rect,text(含content+fontSize),ellipse,image。颜色:#6366f1/#10b981/#f59e0b/#ef4444/#333/#fff/#f8f9fa/#e5e7eb。圆角8-16。生成完整15-30个元素。示例如:[{"type":"frame","x":0,"y":0,"width":375,"height":768,"fill":"#f8f9fa","children":[{"type":"text","x":40,"y":80,"width":295,"height":28,"content":"Sign In","fontSize":24,"fontWeight":700,"fill":"#333"}]}]。`;
    try{const api=(window as any).electronAPI;if(!api?.chatSend)throw new Error('IPC不可用');const r=await api.chatSend({messages:[{role:'user',content:aiIn+(styleRef&&styleRef!=='auto'?` [风格:${styleRef}]`:'')}],systemPrompt:sp,toolsEnabled:false,responseFormat:'json_object'});if(!r)throw new Error('无响应');if(r.error)throw new Error(r.error);let raw=(r.content||'').trim();if(!raw)throw new Error('AI返回空内容');let reply=raw.replace(/```[a-z]*\n?/gi,'').replace(/`/g,'').trim();let m=reply.match(/\[[\s\S]*\]/);if(!m)m=reply.match(/\{[\s\S]*\}/);if(!m){const lastBracket=reply.lastIndexOf('[');const lastBrace=reply.lastIndexOf('{');const start=Math.max(lastBracket,lastBrace);if(start>=0){const sub=reply.substring(start);const m2=sub.match(/\[[\s\S]*\]/)||sub.match(/\{[\s\S]*\}/);if(m2)m=m2}}if(!m)throw new Error('AI未返回JSON，开头: '+raw.substring(0,80));let jsonStr=m[0];let parsed;try{parsed=JSON.parse(jsonStr)}catch(pe){try{jsonStr=jsonStr.replace(/,\s*([}\]])/g,'$1').replace(/'/g,'"').replace(/([{,]\s*)(\w+)(\s*:)/g,'$1"$2"$3').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');parsed=JSON.parse(jsonStr)}catch{try{jsonStr=jsonStr.replace(/\\(?!["\\/bfnrtu])/g,'\\\\');parsed=JSON.parse(jsonStr)}catch{throw new Error('JSON解析失败: '+pe.message)}}}let na=parsed;if(!Array.isArray(parsed)&&parsed&&parsed.nodes&&Array.isArray(parsed.nodes)){if(parsed.plan)setPlan(parsed.plan);na=parsed.nodes}if(!Array.isArray(na)||na.length===0)throw new Error('返回的不是有效数组');const fresh=na.map((el,i:any)=>({...el,id:'ai_'+Date.now()+'_'+i}));setNodes(aiIn.includes('修改')?[...nodes,...fresh]:fresh);setTitle(title||aiIn.substring(0,30));setChatMsgs(prev=>[...prev,{role:'assistant',content:'已生成'+fresh.length+'个节点'}]);toast.success('已生成'+fresh.length+'个节点');setAiIn('')}catch(e){const em=(e as any).message||String(e);setChatMsgs(prev=>[...prev,{role:'assistant',content:'失败: '+em}]);toast.error('生成失败: '+em)}finally{setGen(false)}};

  const save=async()=>{const t=title||'新建画板';try{await apiFetch(API.documents,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t,category:cat,type:'OP',size:'1KB',date:new Date().toISOString().split('T')[0],tags:['AI生成'],featured:false,content:JSON.stringify({version:'1.0',viewport:{width:vp,height:768},children:nodes})})});toast.success('已保存');onClose()}catch{toast.error('保存失败')}};
  const gridBg=`repeating-linear-gradient(0deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px),repeating-linear-gradient(90deg,transparent,transparent 15px,var(--wiki-border) 15px,var(--wiki-border) 16px)`;
  const isDark=typeof document!=='undefined'&&document.documentElement.classList.contains('dark');
  const renderN=(n:DesignNode):JSX.Element=>{const isSel=sel===n.id;const s:React.CSSProperties={position:'absolute',left:n.x,top:n.y,width:n.width,height:n.height,background:n.fill||undefined,borderRadius:n.cornerRadius||0,boxShadow:isSel?'0 0 0 2px #6366f1':undefined,cursor:'pointer',overflow:'hidden',display:n.layout?'flex':'block',flexDirection:n.layout==='vertical'?'column':n.layout==='horizontal'?'row':undefined,gap:n.gap,padding:n.padding};if(n.type==='text')return<div key={n.id} style={{...s,fontSize:n.fontSize||14,color:n.fill||(isDark?'#e0e0e0':'#333'),display:'flex',alignItems:'center',background:'transparent'}} onClick={e=>{e.stopPropagation();setSel(n.id)}}>{n.content||'Text'}</div>;if(n.type==='ellipse')return<div key={n.id} style={{...s,borderRadius:'50%'}} onClick={e=>{e.stopPropagation();setSel(n.id)}}/>;return<div key={n.id} style={s} onClick={e=>{e.stopPropagation();setSel(n.id)}}>{n.children?.map(c=>renderN(c))}</div>};

  return(<div className="flex flex-col h-full">
    <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{borderBottom:'1px solid var(--wiki-border)'}}>
      <button onClick={onClose} className="p-1 rounded hover:bg-wiki-surface2"><XIcon size={15} style={S.text3}/></button>
      <input className="text-sm font-semibold bg-transparent outline-none w-32" style={{color:'var(--wiki-text)'}} value={title} onChange={e=>setTitle(e.target.value)} placeholder="新建画板"/>
      <select value={cat} onChange={e=>setCat(e.target.value)} className="text-xs px-2 py-1 rounded outline-none" style={{background:'var(--wiki-surface2)',color:'var(--wiki-text2)',border:'1px solid var(--wiki-border)'}}>{['设计稿-网页','设计稿-移动端','设计稿-原型'].map(c=><option key={c} value={c}>{c.replace('设计稿-','')}</option>)}</select>
      <div className="flex items-center gap-0.5 ml-2 rounded-lg p-0.5" style={{background:'var(--wiki-surface2)',border:'1px solid var(--wiki-border)'}}>
        {([['select',MoveIcon],['frame',LayersIcon],['rect',SquareIcon],['text',TypeIcon],['ellipse',CircleIcon]] as any[]).map(([t,I])=>(<button key={t} onClick={()=>setTool(t)} className="p-1 rounded" style={{background:tool===t?'var(--wiki-text)':'transparent',color:tool===t?'var(--wiki-bg)':'var(--wiki-text3)'}}><I size={13}/></button>))}
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
          nodes.map((n,i)=>(<div key={n.id} onClick={()=>setSel(n.id)} className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-wiki-surface2" style={{color:sel===n.id?'var(--wiki-text)':'var(--wiki-text2)',background:sel===n.id?'var(--wiki-surface2)':'transparent'}}>
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:n.type==='text'?'#6366f1':n.type==='image'?'#f59e0b':n.type==='ellipse'?'#10b981':n.type==='frame'?'#8b5cf6':'#999'}}/>
            <span className="truncate">{n.type} {i+1}</span>
          </div>))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto scrollbar-thin" style={{background:gridBg}}>
        <div className="flex items-start justify-center p-4">
          <div className="relative">
            <div ref={canvas} className="relative shadow-lg origin-top-left" style={{width:vp,minHeight:700,cursor:tool==='select'?'default':'crosshair',background:isDark?'var(--wiki-bg)':'var(--wiki-surface)',transform:`scale(${zoom/100})`}} onClick={handleClick}>
            {nodes.length===0?<div className="absolute inset-0 flex items-center justify-center text-sm text-wiki-text3">点击顶部工具在画布绘制<br/>或在底部AI对话生成</div>:nodes.map(n=>renderN(n))}
          </div></div>
        </div>
      </div>

      {/* Zone 4: Right — style */}
      <div className="w-44 flex-shrink-0 flex flex-col" style={{borderLeft:'1px solid var(--wiki-border)',background:'var(--wiki-surface)'}}>
        <div className="text-xs font-medium px-3 py-2 text-wiki-text3 uppercase tracking-wider" style={{borderBottom:'1px solid var(--wiki-border)'}}>属性</div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {selNode?<div className="p-2 space-y-2">
            <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">X</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.x} onChange={e=>updNode(selNode.id,{x:Number(e.target.value)})}/></div>
            <div className="flex-1"><div className="text-[9px] text-wiki-text3">Y</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.y} onChange={e=>updNode(selNode.id,{y:Number(e.target.value)})}/></div></div>
            <div className="flex gap-1"><div className="flex-1"><div className="text-[9px] text-wiki-text3">W</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.width} onChange={e=>updNode(selNode.id,{width:Number(e.target.value)})}/></div>
            <div className="flex-1"><div className="text-[9px] text-wiki-text3">H</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} type="number" value={selNode.height} onChange={e=>updNode(selNode.id,{height:Number(e.target.value)})}/></div></div>
            {selNode.type==='text'&&<div><div className="text-[9px] text-wiki-text3">内容</div><input className="w-full px-1 py-0.5 rounded text-xs outline-none" style={S.input} value={selNode.content||''} onChange={e=>updNode(selNode.id,{content:e.target.value})}/></div>}
            <div><div className="text-[9px] text-wiki-text3 mb-1">颜色</div><div className="flex flex-wrap gap-0.5">{PALETTE.slice(0,8).map(c=><button key={c} onClick={()=>updNode(selNode.id,{fill:c})} className="w-4 h-4 rounded-sm" style={{background:c,border:selNode.fill===c?'2px solid var(--wiki-text)':'1px solid var(--wiki-border)'}}/>)}</div></div>
            <button onClick={()=>delNode(selNode.id)} className="w-full py-1 rounded text-xs font-medium" style={{background:'rgba(239,68,68,0.12)',color:'#ef4444'}}><TrashIcon size={10} className="inline"/> 删除</button>
          </div>:<div className="flex-1 flex items-center justify-center text-xs text-wiki-text3 p-2 text-center">选择元素编辑属性</div>}
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
