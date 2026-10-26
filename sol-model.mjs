import {STRATEGIES} from './model.mjs';
export const SOL_DEFAULT_CONFIG=Object.freeze({depositSol:1,positionSol:.1,reserveSol:.01,buyFeePct:1,sellFeePct:1,entryGasSol:.00005,exitGasSol:.00005,buySlipPct:.5,sellSlipPct:.5});
export function runSolReport(data,overrides={}) {
 if(!overrides || typeof overrides!=='object' || Array.isArray(overrides)) throw new TypeError('Invalid config');
 const config={...SOL_DEFAULT_CONFIG,...overrides};
 for(const [k,v] of Object.entries(config)) if(!Object.hasOwn(SOL_DEFAULT_CONFIG,k)||!Number.isFinite(v)||v<0||(k.endsWith('Pct')&&v>=100)) throw new RangeError(`Invalid config ${k}`);
 const c=config;
 if(c.depositSol<=0||c.positionSol<=c.entryGasSol||c.reserveSol>c.depositSol) throw new RangeError('Invalid bankroll or ticket');
 if(!Number.isFinite(data.metadata.start)||!Number.isFinite(data.metadata.end)||data.metadata.end<=data.metadata.start) throw new RangeError('Invalid interval');
 const calls=[...data.calls].sort((a,b)=>a.entryTime-b.entryTime||a.id.localeCompare(b.id));
 if(new Set(calls.map(x=>x.id)).size!==calls.length) throw new Error('Duplicate call');
 for(const x of calls) {
  if(x.chain!=='sol'||!(x.signalPriceSol>0)||!Number.isFinite(x.signalPriceSol)||x.entryTime<data.metadata.start||x.entryTime>=data.metadata.end) throw new Error('Invalid SOL call');
  for(const b of x.candles) if(![b.t,b.closeSol,b.highSolProxy].every(Number.isFinite)||b.closeSol<=0||b.highSolProxy<=0) throw new Error('Invalid SOL candle');
 }
 return {config,totals:{calls:calls.length},strategies:STRATEGIES.map(s=>{
  let cash=c.depositSol,capital=0,peak=0;
  const results=[],open=new Map(),curve=[{time:data.metadata.start,cashSol:cash,equitySol:cash,netPnlSol:0}];
  const events=calls.map(call=>({time:call.entryTime,type:2,call}));
  events.push({time:data.metadata.end,type:3});
  let eventsDirty=true;
  const snapshot=time=>{const equity=cash+[...open.values()].reduce((n,p)=>n+p.tokens*p.remaining*p.mark,0);curve.push({time,cashSol:cash,equitySol:equity,netPnlSol:equity-c.depositSol});};
  while(events.length) {
   if(eventsDirty) {events.sort((a,b)=>a.time-b.time||a.type-b.type||(a.call?.id??'').localeCompare(b.call?.id??''));eventsDirty=false;}
   const e=events.shift();
   if(e.type===0) {
    const {r,leg}=e; cash+=leg.netProceedsSol;
    const p=open.get(r.id);p.remaining-=leg.fraction;capital-=r.budgetSol*leg.fraction;
    if(p.remaining<1e-12) open.delete(r.id);
   } else if(e.type===1) {const p=open.get(e.id);if(p) p.mark=e.price;}
   else if(e.type===2) {
    const x=e.call,{candles,...identity}=x;
    const base={...identity,status:'skipped',skipReason:null,entryExecutionPriceSol:null,tokens:0,budgetSol:0,entryFeeSol:0,entryGasSol:0,entrySlipSol:0,legs:[],netPnlSol:0,roiPct:0,closedAt:null};
    if(cash-c.positionSol<c.reserveSol-1e-12) {results.push({...base,skipReason:'insufficient_cash_reserve'});snapshot(e.time);continue;}
    const bars=candles.filter(b=>b.t>=x.entryTime&&b.t>=data.metadata.start&&b.t+300<=data.metadata.end).sort((a,b)=>a.t-b.t);
    if(!bars.length) throw new Error(`No usable candles: ${x.id}`);
    const notional=(c.positionSol-c.entryGasSol)/(1+c.buyFeePct/100),execution=x.signalPriceSol*(1+c.buySlipPct/100),tokens=notional/execution;
    const r={...base,status:'entered',entryExecutionPriceSol:execution,tokens,budgetSol:c.positionSol,entryFeeSol:notional*c.buyFeePct/100,entryGasSol:c.entryGasSol,entrySlipSol:tokens*(execution-x.signalPriceSol)};
    const orders=s.id==='partial25'?[[.5,2],[.5,5]]:[[1,s.multiple]];
    r.legs=orders.map(([fraction,targetMultiple])=>{
     const hit=bars.find(b=>targetMultiple&&b.highSolProxy>=x.signalPriceSol*targetMultiple),b=hit??bars.at(-1);
     const rawPriceSol=hit?x.signalPriceSol*targetMultiple:b.closeSol,executionPriceSol=rawPriceSol*(1-c.sellSlipPct/100),gross=tokens*fraction*executionPriceSol,feeSol=gross*c.sellFeePct/100;
     const netProceedsSol=gross-feeSol-c.exitGasSol;
     if(netProceedsSol<0) throw new RangeError(`Exit proceeds cannot cover modeled gas: ${x.id}`);
     return {fraction,reason:hit?'tp':'day_close',targetMultiple,rawPriceSol,executionPriceSol,timeStart:b.t,timeEnd:b.t+300,settlementTime:hit?b.t+300:data.metadata.end,stale:!hit&&x.lastKnownPriceAgeSeconds>900,feeSol,gasSol:c.exitGasSol,slippageSol:tokens*fraction*(rawPriceSol-executionPriceSol),netProceedsSol};
    });
    r.netPnlSol=r.legs.reduce((n,l)=>n+l.netProceedsSol,0)-c.positionSol;r.roiPct=r.netPnlSol/c.positionSol*100;r.closedAt=Math.max(...r.legs.map(l=>l.settlementTime));
    results.push(r);cash-=c.positionSol;capital+=c.positionSol;peak=Math.max(peak,capital);open.set(r.id,{tokens,remaining:1,mark:x.signalPriceSol});
    for(const leg of r.legs) events.push({time:leg.settlementTime,type:0,r,leg});
    for(const b of bars) events.push({time:b.t+300,type:1,id:r.id,price:b.closeSol});
    eventsDirty=true;
   }
   if(cash< -1e-10) throw new Error('Negative cash');
   snapshot(e.time);
  }
  const entered=results.filter(r=>r.status==='entered'),sum=fn=>entered.reduce((n,r)=>n+fn(r),0);
  return {id:s.id,label:s.label,initialSol:c.depositSol,finalBalanceSol:cash,netPnlSol:cash-c.depositSol,roiPct:(cash/c.depositSol-1)*100,entered:entered.length,skipped:results.length-entered.length,totalFeesSol:sum(r=>r.entryFeeSol+r.legs.reduce((n,l)=>n+l.feeSol,0)),totalGasSol:sum(r=>r.entryGasSol+r.legs.reduce((n,l)=>n+l.gasSol,0)),totalSlippageSol:sum(r=>r.entrySlipSol+r.legs.reduce((n,l)=>n+l.slippageSol,0)),peakCapitalInUseSol:peak,results,curve};
 })};
}
