// @ts-nocheck
function textMatches(value,model){
 const actual=String(value??'').toLowerCase(),needle=String(model.filter??'').toLowerCase();
 switch(model.type){
  case 'equals':return actual===needle;
  case 'notEqual':return actual!==needle;
  case 'notContains':return !actual.includes(needle);
  case 'startsWith':return actual.startsWith(needle);
  case 'endsWith':return actual.endsWith(needle);
  case 'blank':return actual==='';
  case 'notBlank':return actual!=='';
  default:return actual.includes(needle);
 }
}
function numberMatches(value,model){
 const actual=Number(value),filter=Number(model.filter),filterTo=Number(model.filterTo);
 if(Number.isNaN(actual))return false;
 switch(model.type){
  case 'notEqual':return actual!==filter;
  case 'lessThan':return actual<filter;
  case 'lessThanOrEqual':return actual<=filter;
  case 'greaterThan':return actual>filter;
  case 'greaterThanOrEqual':return actual>=filter;
  case 'inRange':return actual>=filter&&actual<=filterTo;
  case 'blank':return value==null||value==='';
  case 'notBlank':return value!=null&&value!=='';
  default:return actual===filter;
 }
}
function scalarMatches(value,model){
 if(!model)return true;
 if(model.operator&&model.conditions){
  const matches=model.conditions.map(condition=>scalarMatches(value,condition));
  return model.operator==='OR'?matches.some(Boolean):matches.every(Boolean);
 }
 if(model.filterType==='number')return numberMatches(value,model);
 if(model.filterType==='date')return numberMatches(Date.parse(value),{...model,filter:Date.parse(model.dateFrom),filterTo:Date.parse(model.dateTo)});
 if(model.filterType==='set')return !model.values?.length||model.values.includes(value);
 return textMatches(value,model);
}
function applyFilterModel(rows,filterModel){
 const entries=Object.entries(filterModel||{});
 return entries.length?rows.filter(row=>entries.every(([field,model])=>scalarMatches(row[field],model))):rows;
}
function applySortModel(rows,sortModel){
 if(!sortModel?.length)return rows;
 return [...rows].sort((left,right)=>{
  for(const {colId,sort} of sortModel){
   const a=left[colId],b=right[colId];let result=0;
   if(a==null&&b!=null)result=-1;else if(a!=null&&b==null)result=1;else if(typeof a==='number'&&typeof b==='number')result=a-b;else result=String(a??'').localeCompare(String(b??''),undefined,{numeric:true,sensitivity:'base'});
   if(result)return sort==='desc'?-result:result;
  }
  return 0;
 });
}
export function createInfiniteDatasource(rows,{quickFilter='',allowSort=true}={}){
 const snapshot=[...rows],query=quickFilter.trim().toLowerCase();
 return {getRows(params){
  let result=query?snapshot.filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(query))):snapshot;
  result=applyFilterModel(result,params.filterModel);
  if(allowSort)result=applySortModel(result,params.sortModel);
  const block=result.slice(params.startRow,params.endRow),lastRow=params.endRow>=result.length?result.length:-1;
  queueMicrotask(()=>params.successCallback(block,lastRow));
 }};
}
