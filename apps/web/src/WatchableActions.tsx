// @ts-nocheck
import React from 'react';

export function viewingActionsFor(item){
 if(!item)return [];
 if(item.state==='Watched')return [{key:'watch-again',label:'↻ Watch again',state:'In Progress'}];
 if(item.state==='In Progress')return [
  {key:'mark-watched',label:'✓ Mark watched',state:'Watched'},
  {key:'discard',label:'⊘ Discard attempt',state:'Not Started'}
 ];
 return [
  {key:'start',label:'▶ Start watching',state:'In Progress'},
  {key:'mark-watched',label:'✓ Mark watched',state:'Watched'}
 ];
}

export default function WatchableActionMenu({item,targetId,onTarget,onViewingAction,onInspect,onClose,style,variant='floating',className=''}){
 if(!item)return null;
 const run=callback=>{callback?.();onClose?.()};
 return <div className={`nodeContextMenu watchableActionMenu ${variant==='inline'?'inlineActionMenu':''} ${className}`} style={style} onPointerDown={event=>event.stopPropagation()} role="menu" aria-label={`Actions for ${item.title}`}>
  <small>{item.type} · {item.series}</small>
  <b>{item.title}</b>
  <hr/>
  {onTarget&&<button role="menuitem" disabled={item.id===targetId} title={item.id===targetId?'Already the active target':''} onClick={()=>run(()=>onTarget(item))}>◎ Mark as target</button>}
  {viewingActionsFor(item).map(action=><button role="menuitem" key={action.key} onClick={()=>run(()=>onViewingAction(item,action.state))}>{action.label}</button>)}
  {onInspect&&<><hr/><button role="menuitem" onClick={()=>run(()=>onInspect(item))}>ⓘ Inspect details</button></>}
 </div>
}
