import {plotModel,pathFor} from './paper-chart-model.mjs?v=2';
const colors={tp20:'#8e9eff',tp30:'#50d7ad',tp50:'#ffca7a',tp100:'#ef91c2',trail50_20:'#66c8f2'};
const names={tp20:'TP +20%',tp30:'TP +30%',tp50:'TP +50%',tp100:'TP 2×',trail50_20:'Trail +50% / 20%'};
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const svgNode=(tag,attrs={},text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e};
const clock=t=>new Date(t*1000).toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
let latest=null,enabled=new Set(Object.keys(names)),unit='SOL',range=0;
export function updateCharts(s){latest=s;render()}
function render(){
 const root=document.getElementById('performance-charts');if(!root||!latest)return;root.replaceChildren();
 const h=latest.performance_history;
 if(!h||h.run_id!==latest.run_id){root.append(node('p','Account history is loading. Charts will appear with the next public snapshot.','muted'));return}
 const head=node('div',undefined,'row');head.append(node('h2','Profit history · '+latest.run_id));
 const controls=node('div',undefined,'chart-controls');
 const units=node('select');units.setAttribute('aria-label','Chart units');for(const v of ['SOL','%']){const o=node('option',v);o.value=v;units.append(o)}units.value=unit;units.onchange=()=>{unit=units.value;render()};
 const period=node('select');period.setAttribute('aria-label','Chart period');for(const [v,label]of [[0,'All history'],[1,'Last hour'],[6,'Last 6 hours'],[24,'Last 24 hours']]){const o=node('option',label);o.value=v;period.append(o)}period.value=range;period.onchange=()=>{range=Number(period.value);render()};controls.append(units,period);head.append(controls);root.append(head);
 const legend=node('div',undefined,'chart-legend');for(const [id,name]of Object.entries(names)){const b=node('button','━ '+name);b.style.color=colors[id];b.style.opacity=enabled.has(id)?1:.4;b.setAttribute('aria-pressed',enabled.has(id));b.onclick=()=>{enabled.has(id)?enabled.delete(id):enabled.add(id);render()};legend.append(b)}root.append(legend);
 const plots=node('div',undefined,'chart-grid');for(const [mode,title]of [['equity','Total PnL'],['realized','Realized PnL']]){
  const card=node('article',undefined,'box chart-card');card.append(node('h3',title+' · '+unit));card.append(node('p',mode==='equity'?'Includes open positions and modeled costs.':'Closed trades only; changes at the recorded exit time.','muted chart-caption'));
  const plot=node('div',undefined,'chart-plot');plot.tabIndex=0;plot.setAttribute('aria-label',title+' chart. Use arrow keys to inspect.');
  const tip=node('div',undefined,'chart-tooltip');tip.hidden=true;plot.append(tip);
  const model=plotModel(h,mode,unit,[...enabled],range),W=480,H=280,L=84,R=18,T=18,B=38;
  const x=t=>L+(t-model.x[0])/(model.x[1]-model.x[0])*(W-L-R),y=v=>H-B-(v-model.y[0])/(model.y[1]-model.y[0])*(H-T-B);
  const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':title,preserveAspectRatio:'xMidYMid meet'});
  const defs=svgNode('defs'),clip=svgNode('clipPath',{id:'clip-'+mode});clip.append(svgNode('rect',{x:L,y:T,width:W-L-R,height:H-T-B}));defs.append(clip);svg.append(defs);
  for(let i=0;i<=4;i++){const v=model.y[0]+i*(model.y[1]-model.y[0])/4;svg.append(svgNode('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:'#ffffff12'}),svgNode('text',{x:L-9,y:y(v)+4,'text-anchor':'end',fill:'#9ca4b0','font-size':16},(unit==='%'?v.toFixed(1):v.toFixed(3))))}
  svg.append(svgNode('line',{x1:L,x2:W-R,y1:y(0),y2:y(0),stroke:'#b7bdca66','stroke-dasharray':'4 5'}));
  for(let i=0;i<=3;i++){const t=model.x[0]+i*(model.x[1]-model.x[0])/3;svg.append(svgNode('text',{x:x(t),y:H-12,'text-anchor':i===0?'start':i===3?'end':'middle',fill:'#9ca4b0','font-size':16},clock(t)))}
  for(const s of model.series){const path=svgNode('path',{d:pathFor(s.data,x,y,mode==='realized',s.gaps),fill:'none',stroke:colors[s.id],'stroke-width':2.5,'stroke-linejoin':'round','clip-path':`url(#clip-${mode})`});svg.append(path);const last=s.data.at(-1);if(last)svg.append(svgNode('circle',{cx:x(last.t),cy:y(last.v),r:3,fill:colors[s.id],'clip-path':`url(#clip-${mode})`}))}
  const cursor=svgNode('line',{x1:L,x2:L,y1:T,y2:H-B,stroke:'#c6cbd5','stroke-dasharray':'3 4',visibility:'hidden'});svg.append(cursor);plot.prepend(svg);card.append(plot);plots.append(card);
  let selected=model.x[1];function inspect(t){selected=Math.max(model.x[0],Math.min(model.x[1],t));cursor.setAttribute('x1',x(selected));cursor.setAttribute('x2',x(selected));cursor.setAttribute('visibility','visible');tip.replaceChildren(node('strong',clock(selected)+' UTC'));
   for(const s of model.series){const p=s.data.filter(p=>p.t<=selected).at(-1);if(!p)continue;const row=node('div',names[s.id]+': '+(p.v>=0?'+':'')+p.v.toFixed(3)+' '+unit+(p.stale?' · stale':''));row.style.color=colors[s.id];tip.append(row)}tip.hidden=false;}
  plot.onpointermove=e=>{const r=svg.getBoundingClientRect(),sx=(e.clientX-r.left)/r.width*W;inspect(model.x[0]+(sx-L)/(W-L-R)*(model.x[1]-model.x[0]))};plot.onpointerleave=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden')};plot.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();inspect(selected+(e.key==='ArrowLeft'?-1:1)*(model.x[1]-model.x[0])/30)}};
 }
 root.append(plots,node('p','UTC time · Tap/hover to inspect · Equity uses recorded snapshots, not reconstructed candle highs. Gaps in observations are not joined. Lines start at 0 PnL; initial balance is 1 SOL per strategy.','muted chart-caption'));
}
