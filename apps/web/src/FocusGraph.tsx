// @ts-nocheck
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {applyNodeChanges,Background,Controls,Handle,MarkerType,MiniMap,Position,ReactFlow,useNodesState} from '@xyflow/react';
import WatchableActionMenu from './WatchableActions.jsx';
import {artworkUrl} from './mediaUrls.js';

const edgeMeta={
 required:{color:'#ff8b94',dash:'0',width:3},
 sequence:{color:'#8eb7ff',dash:'0',width:2},
 recommended:{color:'#f7c66a',dash:'9 7',width:2},
 optional:{color:'#9aa8b9',dash:'2 7',width:2},
 contracted:{color:'#b29cff',dash:'5 5',width:2}
};
const CARD_WIDTH=400,CARD_HEIGHT=152;
function episodeIdentity(data){return data.type==='Episode'&&Number.isInteger(data.season)&&Number.isInteger(data.episode)?`${data.series} S${String(data.season).padStart(2,'0')}:E${String(data.episode).padStart(2,'0')}`:data.series}
function ItemNode({data}){const hasPoster=Boolean(data.posterUrl||data.poster),role=data.selected?'selected':data.target?'target':data.nextUp?'nextUp':null,roleLabel=role==='selected'?'Selected':role==='target'?'Target':role==='nextUp'?'Next Up':null;return <div className={'watchNode '+(hasPoster?'hasPoster ':'')+(data.target?'target ':'')+(data.nextUp?'nextUp ':'')+(data.selected?'selected':'')} aria-current={data.selected?'true':undefined} aria-label={`${data.title}${roleLabel?` · ${roleLabel}`:''}`} data-node-role={role||undefined}><Handle id="input-left" type="target" position={Position.Left}/>{roleLabel&&<span className={`roleNodeBadge ${role}NodeBadge`}>{roleLabel}</span>}{hasPoster&&(data.posterUrl?<img className="nodePosterImage" src={artworkUrl(data.posterUrl)} alt={`${data.title} poster`}/>:<div className={'nodePoster '+data.type.toLowerCase()} aria-label="Poster image placeholder"><span>Poster</span><b>Image</b><span>Placeholder</span></div>)}<div className="nodeContent"><div className="nodeTop"><span>{data.type}</span><i className={'dot '+data.state.toLowerCase().replace(' ','-')}/></div><strong>{data.title}</strong><small>{episodeIdentity(data)}</small><div className="nodeBottom"><span>{data.runtime} min</span><span>{data.state}</span></div></div><Handle id="output-right" type="source" position={Position.Right}/></div>}
function CollapsedGroup({data}){return <div className="collapsedGroup"><Handle id="input-left" type="target" position={Position.Left}/><span>COLLAPSED SERIES</span><b>{data.series}</b><small>{data.count} items on this route</small><Handle id="output-right" type="source" position={Position.Right}/></div>}
function SeriesGroupNode({data}){return <div className="seriesGroupFrame"><span>SERIES</span><b>{data.series}</b><small>{data.count} visible item{data.count===1?'':'s'}</small></div>}
const nodeTypes={watchable:ItemNode,collapsed:CollapsedGroup,seriesGroup:SeriesGroupNode};
function closure(target,relations,direction){const seen=new Set([target]);let changed=true;while(changed){changed=false;for(const [s,t] of relations){const from=direction==='up'?t:s,to=direction==='up'?s:t;if(seen.has(from)&&!seen.has(to)){seen.add(to);changed=true}}}return seen}
function distances(root,relations,direction){const out={[root]:0};let changed=true,passes=0;while(changed&&passes<=relations.length){changed=false;passes++;for(const [s,t] of relations){const from=direction==='up'?t:s,to=direction==='up'?s:t;if(out[from]===undefined)continue;const candidate=out[from]+1;if(out[to]===undefined||candidate>out[to]){out[to]=candidate;changed=true}}}return out}
function contractRelations(relations,visibleIds){
 const outgoing=new Map();for(const relation of relations){if(!outgoing.has(relation[0]))outgoing.set(relation[0],[]);outgoing.get(relation[0]).push(relation)}
 const contracted=[],dedupe=new Set();
 for(const source of visibleIds){
  const walk=(current,kinds,hiddenCount,visited)=>{
   for(const [,next,kind] of outgoing.get(current)||[]){
    if(next===source||visited.has(next))continue;
    const nextKinds=[...kinds,kind];
    if(visibleIds.has(next)){
     const relationship=hiddenCount===0?kind:(nextKinds.every(x=>x===nextKinds[0])?nextKinds[0]:'contracted');
     const key=`${source}|${next}|${relationship}`;
     if(!dedupe.has(key)){dedupe.add(key);contracted.push([source,next,relationship,hiddenCount>0])}
    }else walk(next,nextKinds,hiddenCount+1,new Set([...visited,next]));
   }
  };
  walk(source,[],0,new Set([source]));
 }
 return contracted
}
function logicPositions(records,side,primarySeries){const result={},layers=new Map();for(const record of records){if(!layers.has(record.level))layers.set(record.level,[]);layers.get(record.level).push(record)}for(const [level,layer] of layers){layer.sort((a,b)=>(a.series===primarySeries?0:1)-(b.series===primarySeries?0:1)||a.order-b.order);layer.forEach((record,index)=>{const branch=index===0?0:Math.ceil(index/2)*270*(index%2===1?1:-1);result[record.id]={x:side*level*465,y:branch}})}return result}
function connectedSeriesRuns(members,relations){
 const ids=new Set(members.map(x=>x.id)),byId=new Map(members.map(x=>[x.id,x])),adjacency=new Map(members.map(x=>[x.id,new Set()]));
 for(const [source,target] of relations){if(ids.has(source)&&ids.has(target)){adjacency.get(source).add(target);adjacency.get(target).add(source)}}
 const runs=[],seen=new Set();for(const member of [...members].sort((a,b)=>a.order-b.order)){if(seen.has(member.id))continue;const run=[],queue=[member.id];seen.add(member.id);while(queue.length){const id=queue.shift();run.push(byId.get(id));for(const next of adjacency.get(id)){if(!seen.has(next)){seen.add(next);queue.push(next)}}}runs.push(run.sort((a,b)=>a.order-b.order))}return runs
}
function tightenSeriesGroups(nodes){
 const result=nodes.map(node=>({...node,position:{...node.position},style:node.style?{...node.style}:node.style})),byId=new Map(result.map(node=>[node.id,node]));
 for(const group of result.filter(node=>node.type==='seriesGroup')){
  const children=result.filter(node=>node.parentId===group.id);if(!children.length)continue;
  const padX=28,padTop=48,padBottom=28,minX=Math.min(...children.map(node=>node.position.x)),minY=Math.min(...children.map(node=>node.position.y)),maxX=Math.max(...children.map(node=>node.position.x+(node.width||CARD_WIDTH))),maxY=Math.max(...children.map(node=>node.position.y+(node.height||CARD_HEIGHT))),shiftX=minX-padX,shiftY=minY-padTop,width=maxX-minX+padX*2,height=maxY-minY+padTop+padBottom;
  group.position={x:group.position.x+shiftX,y:group.position.y+shiftY};group.width=width;group.height=height;group.style={...group.style,width,height};
  children.forEach(child=>{const current=byId.get(child.id);current.position={x:current.position.x-shiftX,y:current.position.y-shiftY}})
 }
 return result
}
export default function FocusGraph({items,relations,target,nextUpId,selectedId,onTarget,mode,onMode,onPick,onViewingAction,inspector}){
 const [showAfter,setShowAfter]=useState(false),[hideWatched,setHideWatched]=useState(false),[type,setType]=useState('All'),[state,setState]=useState('All'),[search,setSearch]=useState('');
 const [enabledEdges,setEnabledEdges]=useState(()=>new Set(Object.keys(edgeMeta))),[collapsed,setCollapsed]=useState(()=>new Set()),[contextMenu,setContextMenu]=useState(null);
 useEffect(()=>{if(!contextMenu)return;const close=()=>setContextMenu(null),closeOnEscape=event=>{if(event.key==='Escape')close()};window.addEventListener('pointerdown',close);window.addEventListener('keydown',closeOnEscape);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',closeOnEscape)}},[contextMenu]);
 const relevantRelations=useMemo(()=>relations.filter(r=>enabledEdges.has(r[2])),[relations,enabledEdges]);
 const graph=useMemo(()=>{
  const upstream=closure(target,relevantRelations,'up'),downstream=showAfter?closure(target,relevantRelations,'down'):new Set([target]);
  const routeIds=new Set([...upstream,...downstream]),q=search.trim().toLowerCase();
  const visibleItems=items.filter(x=>routeIds.has(x.id)&&(x.id===target||(!hideWatched||x.state!=='Watched'))&&(type==='All'||x.type===type)&&(state==='All'||x.state===state)&&(!q||`${x.title} ${x.series} ${x.type}`.toLowerCase().includes(q)));
  if(!visibleItems.some(x=>x.id===target)){const anchor=items.find(x=>x.id===target);if(anchor)visibleItems.push(anchor)}
  const ids=new Set(visibleItems.map(x=>x.id)),activeRelations=contractRelations(relevantRelations,ids);
  const targetSeries=items.find(x=>x.id===target)?.series;
  const seriesOrder=[targetSeries,...[...new Set(visibleItems.map(x=>x.series))].filter(x=>x!==targetSeries).sort()];
  const runDefinitions=seriesOrder.flatMap(group=>connectedSeriesRuns(visibleItems.filter(x=>x.series===group),activeRelations).map((run,runIndex)=>({group,run,runIndex,minOrder:Math.min(...run.map(x=>x.order||0))}))).sort((a,b)=>a.minOrder-b.minOrder||a.group.localeCompare(b.group));
  // Collapse first, then lay out the reduced graph. Hidden children must not
  // reserve their old columns, region spans, branch slots, or stagger offsets.
  const itemToNode={};
  runDefinitions.forEach(definition=>{
   const members=visibleItems.filter(x=>x.series===definition.group),isCollapsed=collapsed.has(definition.group)&&!members.some(x=>x.id===target),nodeId=isCollapsed?`series:${definition.group}:${definition.runIndex}`:null;
   definition.isCollapsed=isCollapsed;definition.nodeId=nodeId;definition.run.forEach(item=>itemToNode[item.id]=nodeId||item.id)
  });
  const layoutRelationKeys=new Set(),layoutRelations=[];
  activeRelations.forEach(([prerequisite,dependent])=>{const source=itemToNode[prerequisite],destination=itemToNode[dependent],key=`${source}>${destination}`;if(!source||!destination||source===destination||layoutRelationKeys.has(key))return;layoutRelationKeys.add(key);layoutRelations.push([source,destination])});
  const entityIds=[...new Set(Object.values(itemToNode))],entityWidths=Object.fromEntries(entityIds.map(id=>[id,id.startsWith('series:')?220:CARD_WIDTH])),targetNode=itemToNode[target];
  const upDistance=distances(targetNode,layoutRelations,'up'),downDistance=distances(targetNode,layoutRelations,'down'),columnGap=76,positions={};
  const maxUp=Math.max(0,...Object.values(upDistance)),maxDown=Math.max(0,...Object.values(downDistance)),upX={0:0},downX={0:0};
  for(let depth=1;depth<=maxUp;depth++){const layerWidth=Math.max(...entityIds.filter(id=>upDistance[id]===depth).map(id=>entityWidths[id]),0);upX[depth]=upX[depth-1]-columnGap-layerWidth}
  for(let depth=1;depth<=maxDown;depth++){const previousWidth=Math.max(...entityIds.filter(id=>downDistance[id]===depth-1).map(id=>entityWidths[id]),depth===1?entityWidths[targetNode]:0);downX[depth]=downX[depth-1]+previousWidth+columnGap}
  entityIds.forEach(id=>{const upstreamDepth=upDistance[id],downstreamDepth=downDistance[id];positions[id]={x:id===targetNode?0:upstreamDepth!==undefined?upX[upstreamDepth]:downX[downstreamDepth]??0,y:0}});
  // Stagger local connected runs according to their path order. A band belongs
  // to this run only—not to its Series—so a Series can return at another level.
  // Overlapping horizontal spans are never assigned to the same band.
  const occupiedBands=new Map(),bandStep=280;
  runDefinitions.forEach((definition,index)=>{
   const definitionNodeIds=[...new Set(definition.run.map(item=>itemToNode[item.id]))],minX=Math.min(...definitionNodeIds.map(id=>positions[id]?.x||0))-28,maxX=Math.max(...definitionNodeIds.map(id=>(positions[id]?.x||0)+entityWidths[id]))+28,previousBand=index?runDefinitions[index-1].band:1,preferred=index===0?0:(previousBand===0?1:0),candidates=[preferred,0,1,-1,2,-2,3,-3].filter((value,i,array)=>array.indexOf(value)===i);
   const band=candidates.find(candidate=>!(occupiedBands.get(candidate)||[]).some(span=>minX<span.maxX&&maxX>span.minX))??candidates[candidates.length-1];definition.band=band;if(!occupiedBands.has(band))occupiedBands.set(band,[]);occupiedBands.get(band).push({minX,maxX});definitionNodeIds.forEach(id=>{positions[id]={...positions[id],y:band*bandStep}})
  });
  const nodes=[];
  for(const {group,run,runIndex} of runDefinitions){
   const definition=runDefinitions.find(candidate=>candidate.group===group&&candidate.runIndex===runIndex);
    if(definition.isCollapsed){
     const id=definition.nodeId;nodes.push({id,type:'collapsed',position:positions[id],data:{series:group,count:run.length},width:220,height:88,style:{width:220,height:88}});continue
    }
    const padX=28,padTop=48,padBottom=28,minX=Math.min(...run.map(x=>positions[itemToNode[x.id]].x)),minY=Math.min(...run.map(x=>positions[itemToNode[x.id]].y)),maxX=Math.max(...run.map(x=>positions[itemToNode[x.id]].x+CARD_WIDTH)),maxY=Math.max(...run.map(x=>positions[itemToNode[x.id]].y+CARD_HEIGHT));
    const groupId=`group:${group}:${runIndex}`,groupPosition={x:minX-padX,y:minY-padTop},groupWidth=maxX-minX+padX*2,groupHeight=maxY-minY+padTop+padBottom;
    nodes.push({id:groupId,type:'seriesGroup',position:groupPosition,data:{series:group,count:run.length},width:groupWidth,height:groupHeight,style:{width:groupWidth,height:groupHeight},selectable:false,draggable:true,zIndex:0});
    run.forEach(x=>{const position=positions[itemToNode[x.id]],isSelected=x.id===selectedId,isTarget=x.id===target,isNextUp=x.id===nextUpId;nodes.push({id:x.id,type:'watchable',parentId:groupId,position:{x:position.x-groupPosition.x,y:position.y-groupPosition.y},data:{...x,target:isTarget,nextUp:isNextUp,selected:isSelected},width:CARD_WIDTH,height:CARD_HEIGHT,style:{width:CARD_WIDTH,height:CARD_HEIGHT},zIndex:isSelected?4:isTarget?3:isNextUp?2:1})})
  }
  const dedupe=new Set(),edges=[];activeRelations.forEach(([prerequisite,dependent,kind,isContracted],i)=>{const source=itemToNode[prerequisite],destination=itemToNode[dependent];if(!source||!destination||source===destination)return;const key=`${source}|${destination}|${kind}`;if(dedupe.has(key))return;dedupe.add(key);const m=edgeMeta[kind];edges.push({id:'e'+i,source,target:destination,sourceHandle:'output-right',targetHandle:'input-left',type:'default',markerEnd:{type:MarkerType.ArrowClosed,color:m.color},style:{stroke:m.color,strokeWidth:m.width,strokeDasharray:m.dash},animated:kind==='recommended',ariaLabel:isContracted?`Contracted dependency path from ${prerequisite} to ${dependent}`:undefined})});
  const topology=[...visibleItems].map(item=>`${item.id}:${item.series}`).sort().join(',')+'|'+activeRelations.map(([a,b,k])=>`${a}>${b}:${k}`).sort().join(',');
  return {nodes,edges,visible:visibleItems.length,total:items.length,key:target+'|'+nextUpId+'|'+topology+'|'+[...collapsed].sort().join(',')+'|'+showAfter+'|'+hideWatched+'|'+type+'|'+state+'|'+search};
 },[items,target,nextUpId,selectedId,relevantRelations,showAfter,hideWatched,type,state,search,collapsed]);
 const [flowNodes,setFlowNodes]=useNodesState(graph.nodes);
 const previousGraphKey=useRef(graph.key);
 useEffect(()=>{setFlowNodes(current=>{if(previousGraphKey.current!==graph.key){previousGraphKey.current=graph.key;return graph.nodes}const currentById=new Map(current.map(node=>[node.id,node]));return graph.nodes.map(node=>{const prior=currentById.get(node.id);if(!prior)return node;return {...node,position:prior.position,width:prior.width||node.width,height:prior.height||node.height,style:node.type==='seriesGroup'?prior.style:node.style}})})},[graph.key,graph.nodes,setFlowNodes]);
 const onFlowNodesChange=useCallback(changes=>setFlowNodes(nodes=>applyNodeChanges(changes,nodes)),[setFlowNodes]);
 const tightenGroups=useCallback(()=>setFlowNodes(nodes=>tightenSeriesGroups(nodes)),[setFlowNodes]);
 function toggleEdge(kind){setEnabledEdges(old=>{const n=new Set(old);n.has(kind)?n.delete(kind):n.add(kind);return n})}
 function toggleGroup(group){setCollapsed(old=>{const n=new Set(old);n.has(group)?n.delete(group):n.add(group);return n})}
 const series=[...new Set(items.map(x=>x.series))];
 const menuItem=contextMenu&&items.find(x=>x.id===contextMenu.id);
 return <>
  <div className="graphTools">
   <label>Focus mode<select value={mode} onChange={e=>onMode(e.target.value)}><option>Release Timeline</option><option>Critical Path</option><option>Release Catch-Up</option></select></label>
   <label>Watch target<select value={target} onChange={e=>onTarget(e.target.value)}>{items.map(x=><option value={x.id} key={x.id}>{x.title}</option>)}</select></label>
   <label className="graphSearch">Find content<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title, Series, type…"/></label>
   <label>Type<select value={type} onChange={e=>setType(e.target.value)}><option>All</option>{[...new Set(items.map(x=>x.type))].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>State<select value={state} onChange={e=>setState(e.target.value)}><option>All</option>{[...new Set(items.map(x=>x.state))].map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="toolCheck"><input type="checkbox" checked={hideWatched} onChange={e=>setHideWatched(e.target.checked)}/> Hide watched</label>
   <label className="toolCheck"><input type="checkbox" checked={showAfter} onChange={e=>setShowAfter(e.target.checked)}/> Explore beyond target</label>
  </div>
  <div className="graphSubTools"><div className="edgeFilters"><b>Relationships</b>{Object.entries(edgeMeta).filter(([kind])=>kind!=='contracted').map(([kind,m])=><label key={kind}><input type="checkbox" checked={enabledEdges.has(kind)} onChange={()=>toggleEdge(kind)}/><i style={{borderTopColor:m.color,borderTopStyle:m.dash==='0'?'solid':'dashed'}}/>{kind}</label>)}<span className="contractedLegend"><i/> hidden path</span></div><div className="groupFilters"><b>Series groups</b>{series.map(group=>{const isTargetSeries=items.find(x=>x.id===target)?.series===group;return <button className={collapsed.has(group)?'collapsed':''} disabled={isTargetSeries} title={isTargetSeries?'The target Series remains expanded':'Collapse or expand this Series'} onClick={()=>toggleGroup(group)} key={group}>{collapsed.has(group)?'▸':'▾'} {group}{isTargetSeries?' · focus':''}</button>})}</div><span className="arrangeHint">Drag cards to arrange</span><button className="resetLayout" onClick={()=>setFlowNodes(graph.nodes)}>Reset layout</button><span className="visibleCount">{graph.visible} of {graph.total} items</span></div>
  <div className="mapLayout"><section className="canvasPanel"><ReactFlow key={graph.key} nodes={flowNodes} edges={graph.edges} nodeTypes={nodeTypes} onNodesChange={onFlowNodesChange} onNodeDragStop={tightenGroups} onPaneClick={()=>setContextMenu(null)} onNodeClick={(_,node)=>{setContextMenu(null);if(node.type==='watchable')onPick(items.find(x=>x.id===node.id))}} onNodeContextMenu={(event,node)=>{if(node.type!=='watchable')return;event.preventDefault();onPick(items.find(x=>x.id===node.id));setContextMenu({id:node.id,x:Math.min(event.clientX,window.innerWidth-230),y:Math.min(event.clientY,window.innerHeight-260)})}} fitView fitViewOptions={{padding:.18,maxZoom:1.15}} minZoom={.2} maxZoom={1.8} nodesDraggable proOptions={{hideAttribution:true}}><Background color="#263445" gap={22}/><Controls/><MiniMap pannable zoomable position="bottom-right" nodeColor={n=>n.id===selectedId?'#22d3ee':n.id===target?'#72e0b5':n.id===nextUpId?'#c084fc':n.type==='collapsed'?'#f7c66a':'#7890a8'} nodeStrokeColor="#d8e4ef" nodeStrokeWidth={2} nodeBorderRadius={6} bgColor="#101923" maskColor="rgba(8,13,18,.32)" maskStrokeColor="#72e0b5" style={{width:190,height:125}}/></ReactFlow>{menuItem&&<WatchableActionMenu item={menuItem} targetId={target} onTarget={item=>{onTarget(item.id);onPick(item)}} onViewingAction={onViewingAction} onInspect={onPick} onClose={()=>setContextMenu(null)} style={{left:contextMenu.x,top:contextMenu.y}}/>}</section>{inspector}</div>
 </>
}
