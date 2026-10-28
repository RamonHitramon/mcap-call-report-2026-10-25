const finite = v => typeof v === 'number' && Number.isFinite(v);
const timestamp = v => finite(v) && v > 0;
export function pnlModel(p, asof) {
 const approx = p.closed == null;
 const value = approx ? p.last_mark : p.proceeds;
 const valid = finite(p.cost) && p.cost >= 0 && finite(value) && value >= 0;
 const net = valid ? (approx ? Math.max(0,value*.99-.00005) : value)-p.cost : null;
 const stale = approx && (!timestamp(asof) || !timestamp(p.last_seen) || p.last_seen>asof || asof-p.last_seen>90);
 return {net,percent:net!==null && p.cost>0 ? net/p.cost*100:null,approx,stale};
}
export const entryDelay = p => finite(p.entry_delay_seconds) && p.entry_delay_seconds >= 0 ? p.entry_delay_seconds : null;
export function formatDuration(v) {
 if (!finite(v) || v<0) return '—';
 if(v<60) return `${Number(v.toFixed(1))}s`;
 if(v<3600) return `${Math.floor(v/60)}m${Math.floor(v%60)?' '+Math.floor(v%60)+'s':''}`;
 return `${Math.floor(v/3600)}h${Math.floor(v%3600/60)?' '+Math.floor(v%3600/60)+'m':''}`;
}
export function formatUTC(v) {
 if(!timestamp(v)) return '—';
 const date=new Date(v*1000); if(!Number.isFinite(date.getTime())) return '—';
 const iso=date.toISOString(); return iso.slice(11,19)+' UTC\n'+iso.slice(0,10);
}
function signed(v, digits, unit) {
 if(!finite(v)) return '—';
 const absolute=Math.abs(v).toFixed(digits);
 return (Number(absolute)===0?'':v<0?'−':'+')+absolute+unit;
}
export const formatSOL = v => signed(v,3,' SOL');
export const formatPercent = v => signed(v,2,'%');
export function safeLinks(p) {
 // Build GMGN from a validated mint only; never add undocumented timestamp queries.
 const gmgn=typeof p.address==='string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.address) ? 'https://gmgn.ai/sol/token/'+p.address : null;
 const telegram=typeof p.source_url==='string' && /^https:\/\/t\.me\/mcap100k_sol\/\d+$/.test(p.source_url) ? p.source_url : null;
 return {gmgn,telegram};
}
export function selectPositions(positions,{strategy='all',status='all',sort='latest'}={},asof) {
 const rows=(positions||[]).filter(p=>(strategy==='all'||p.strategy===strategy)&&(status==='all'||(status==='open'?p.closed==null:p.closed!=null)));
 const value=p=>sort.startsWith('hold-')?holdModel(p,asof).seconds:sort.startsWith('pnl-')?pnlModel(p,asof).net:timestamp(p.opened)?p.opened:null;
 return rows.sort((a,b)=>{
  if(sort==='strategy') return String(a.strategy??'').localeCompare(String(b.strategy??''));
  const av=value(a),bv=value(b);
  if(av===null||bv===null) return av===bv?0:av===null?1:-1;
  return (av-bv)*(['oldest','hold-asc','pnl-asc'].includes(sort)?1:-1);
 });
}
export function countModel(s,shown) {
 const loaded=(s.positions||[]).length;
 const walletTotal=(s.wallets||[]).reduce((n,w)=>n+(finite(w.open)?w.open:0)+(finite(w.closed)?w.closed:0),0);
 const total=Math.max(loaded,finite(s.positions_total)?s.positions_total:walletTotal);
 return {shown,loaded,total,truncated:total>loaded};
}
export function holdModel(p, asof) {
 const end = p.closed == null ? asof : p.closed;
 const seconds = timestamp(p.opened) && timestamp(end) && end >= p.opened ? end-p.opened : null;
 return {seconds, tone:seconds === null?'muted':seconds<30?'neg':seconds<=60?'warning':'pos'};
}
