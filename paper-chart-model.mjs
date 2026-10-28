export function plotModel(history,mode='equity',units='SOL',enabled=null,hours=0){
 const end=Number(history?.asof)||0,start=Number(history?.started_at)||end,min=hours?Math.max(start,end-hours*3600):start;
 const series=(history?.series||[]).filter(s=>!enabled||enabled.includes(s.id)).map(s=>{
  const raw=mode==='realized'?s.realized:s.points;
  let data=(raw||[]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>({t:p[0],v:p[1]*(units==='%'?100:1),stale:mode==='equity'&&Boolean(p[4])}));
  const previous=data.filter(p=>p.t<min).at(-1);data=data.filter(p=>p.t>=min);if(previous)data.unshift(previous);
  return {id:s.id,name:s.name,data,gaps:mode==='equity'?(s.gaps||[]):[]};
 });
 const values=series.flatMap(s=>s.data.map(p=>p.v)),lo=Math.min(0,...values),hi=Math.max(0,...values),pad=Math.max((hi-lo)*.12,units==='%'?.5:.005);
 return {series,x:[min,Math.max(end,min+1)],y:[lo-pad,hi+pad],mode,units};
}
export function pathFor(data,x,y,step=false,gaps=[]){
 let path='',previous=null;
 for(const p of data){
  const move=!previous||p.stale||previous.stale||gaps.some(g=>g[0]<p.t&&g[1]>previous.t);
  const px=x(p.t).toFixed(2),py=y(p.v).toFixed(2);
  path+=move?`M${px},${py}`:step?`H${px}V${py}`:`L${px},${py}`;previous=p;
 }
 return path;
}
