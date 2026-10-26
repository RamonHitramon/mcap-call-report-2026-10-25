export const STRATEGIES = [
 ...[['tp10','TP +10%',1.1],['tp20','TP +20%',1.2],['tp30','TP +30%',1.3],['tp50','TP +50%',1.5],['tp2','TP 2×',2],['tp3','TP 3×',3],['tp5','TP 5×',5]].map(([id,label,multiple])=>({id,label,multiple})),
 {id:'hold',label:'Hold to day close',multiple:null},
 {id:'partial25',label:'50% at 2× / 50% at 5×',multiple:null}
];
// Illustrative user-editable assumptions, NOT measured provider/chain fees.
export const DEFAULT_CONFIG = Object.freeze({stakeUsd:100,buyFeePct:1,sellFeePct:1,entryGasUsd:0.05,exitGasUsd:0.05,buySlipPct:0.5,sellSlipPct:0.5});
const sum=(items,key)=>items.reduce((n,item)=>n+item[key],0);
const validateConfig=c=>{
 for(const key of Object.keys(DEFAULT_CONFIG)) {
  if(!Number.isFinite(c[key]) || c[key]<0 || (key.endsWith('Pct') && c[key]>=100)) throw new RangeError(`Invalid config ${key}`);
 }
 if(c.stakeUsd<=c.entryGasUsd) throw new RangeError('Invalid config: stake must exceed entry gas');
};
export function runReport(data,overrides={}) {
 if(!overrides || typeof overrides!=='object' || Array.isArray(overrides)) throw new TypeError('Invalid config');
 const config={...DEFAULT_CONFIG,...overrides};
 validateConfig(config);
 if(config.chainFees!==undefined) {
  if(!config.chainFees || typeof config.chainFees!=='object' || Array.isArray(config.chainFees)) throw new TypeError('Invalid config chainFees');
  for(const fees of Object.values(config.chainFees)) {
   if(!fees || typeof fees!=='object' || Array.isArray(fees) || Object.keys(fees).some(k=>!Object.hasOwn(DEFAULT_CONFIG,k) || k==='stakeUsd')) throw new TypeError('Invalid config chain fee override');
   validateConfig({...config,...fees});
  }
 }
 const {stakeUsd}=config;
 return {config,totals:{calls:data.calls.length,totalInitialUsd:stakeUsd*data.calls.length},strategies:STRATEGIES.map(s=>{
  const results=data.calls.map(call=>{
   const c={...config,...config.chainFees?.[call.chain]};
   const bars=call.candles.filter(b=>b.t>=call.entryTime && b.t>=data.metadata.start && b.t+300<=data.metadata.end).sort((a,b)=>a.t-b.t);
   const notional=(stakeUsd-c.entryGasUsd)/(1+c.buyFeePct/100);
   const entryExecutionPrice=call.signalPrice*(1+c.buySlipPct/100);
   const tokens=notional/entryExecutionPrice;
   const entryFeeUsd=notional*c.buyFeePct/100;
   const entrySlipUsd=tokens*(entryExecutionPrice-call.signalPrice);
   const orders=s.id==='partial25'?[[0.5,2],[0.5,5]]:[[1,s.multiple]];
   const legs=orders.map(([fraction,targetMultiple])=>{
    const bar=bars.find(b=>targetMultiple && b.high>=call.signalPrice*targetMultiple);
    const selected=bar??bars.at(-1);
    const rawPrice=bar?call.signalPrice*targetMultiple:selected.close;
    const executionPrice=rawPrice*(1-c.sellSlipPct/100);
    const grossProceedsUsd=tokens*fraction*executionPrice;
    const feeUsd=grossProceedsUsd*c.sellFeePct/100;
    return {fraction,reason:bar?'tp':'day_close',targetMultiple,rawPrice,executionPrice,timeStart:selected.t,timeEnd:selected.t+300,stale:!bar && call.lastKnownPriceAgeSeconds>900,feeUsd,gasUsd:c.exitGasUsd,slippageUsd:tokens*fraction*(rawPrice-executionPrice),grossProceedsUsd,netProceedsUsd:grossProceedsUsd-feeUsd-c.exitGasUsd};
   });
   const grossPnlUsd=stakeUsd*(legs.reduce((n,l)=>n+l.fraction*l.rawPrice,0)/call.signalPrice-1);
   const netPnlUsd=sum(legs,'netProceedsUsd')-stakeUsd;
   const exitFeesUsd=sum(legs,'feeUsd'),exitGasUsd=sum(legs,'gasUsd'),exitSlipUsd=sum(legs,'slippageUsd');
   const {candles,...identity}=call;
   return {...identity,entryExecutionPrice,tokens,legs,grossPnlUsd,grossRoiPct:grossPnlUsd/stakeUsd*100,netPnlUsd,netRoiPct:netPnlUsd/stakeUsd*100,entryFeeUsd,entryGasUsd:c.entryGasUsd,exitFeesUsd,exitGasUsd,totalFeesUsd:entryFeeUsd+exitFeesUsd,totalGasUsd:c.entryGasUsd+exitGasUsd,totalSlippageUsd:entrySlipUsd+exitSlipUsd,entrySlipUsd,exitSlipUsd,closedAt:Math.max(...legs.map(l=>l.timeEnd))};
  });
  results.sort((a,b)=>a.entryTime-b.entryTime || a.id.localeCompare(b.id));
  const grossPnlUsd=sum(results,'grossPnlUsd'),netPnlUsd=sum(results,'netPnlUsd');
  const initialUsd=results.length*stakeUsd;
  let cumulativeNetUsd=0;
  const curve=results.map((r,i)=>({index:i+1,callId:r.id,pnlUsd:r.netPnlUsd,cumulativeNetUsd:(cumulativeNetUsd+=r.netPnlUsd)}));
  return {id:s.id,label:s.label,callCount:results.length,hits:results.filter(r=>r.legs.some(l=>l.reason==='tp')).length,grossPnlUsd,grossRoiPct:initialUsd?grossPnlUsd/initialUsd*100:0,netPnlUsd,netRoiPct:initialUsd?netPnlUsd/initialUsd*100:0,totalFeesUsd:sum(results,'totalFeesUsd'),totalGasUsd:sum(results,'totalGasUsd'),totalSlippageUsd:sum(results,'totalSlippageUsd'),winCount:results.filter(r=>r.netPnlUsd>0).length,staleExitsCount:results.filter(r=>r.legs.some(l=>l.stale)).length,results,curve};
 })};
}
