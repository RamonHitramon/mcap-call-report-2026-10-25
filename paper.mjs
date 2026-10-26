const feed='https://raw.githubusercontent.com/RamonHitramon/mcap-call-report-2026-10-25/paper-feed/live-paper.json';
const $=id=>document.getElementById(id);
const sol=v=>Number(v).toFixed(6)+' SOL';
const at=t=>t?new Date(t*1000).toLocaleString('ru-RU',{timeZone:'UTC'})+' UTC':'—';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const field=(list,key,value)=>{const line=el('div');line.append(el('dt',key),el('dd',value));list.append(line);};
let state=null,busy=false;
function render(){
 const s=state,age=Date.now()/1000-s.updated_at,stale=age>300;
 $('status').textContent=(stale?'⚠ Снимок устарел. ':'● Демо работает · ')+at(s.updated_at)+(s.run_id?' · '+s.run_id:'')+' · новых коллов: '+s.signals;
 $('status').className=stale?'warning':'muted';$('wallets').replaceChildren();
 for(const w of s.wallets){const card=el('article',undefined,'card');card.append(el('h3',w.name),el('small','Оценка счёта с расходами'),el('div',sol(w.equity_sol),'big'),el('div',(w.net_sol>=0?'+':'')+sol(w.net_sol)+' · '+(w.net_sol*100).toFixed(2)+'%',w.net_sol>=0?'pos':'neg'));const dl=el('dl');field(dl,'Свободно',sol(w.cash_sol));field(dl,'Реализовано',sol(w.realised_sol));field(dl,'Открыто / закрыто',w.open+' / '+w.closed);field(dl,'Пропущено',w.skipped);if(w.stale)field(dl,'Устаревшие оценки',w.stale);card.append(dl);$('wallets').append(card);}
 const selected=$('filter').value;const ps=s.positions.filter(p=>selected==='all'||p.strategy===selected);$('positions').replaceChildren();
 if(!ps.length)$('positions').append(el('p',s.signals?'В этом фильтре пока нет сделок.':'Ожидаем первый новый подходящий колл. Старые сигналы задним числом не покупаются.','empty'));
 for(const p of ps){const card=el('article',undefined,'trade');const name=s.wallets.find(w=>w.id===p.strategy)?.name||p.strategy;const title=el('h3',p.symbol+' · '+name);card.append(title,el('div',p.address,'address'));const dl=el('dl');field(dl,'Вход',at(p.opened));field(dl,'Затраты',sol(p.cost));field(dl,'Состояние',p.closed?'Закрыта · '+p.reason:(Date.now()/1000-p.last_seen>90?'Открыта · оценка устарела':'Открыта'));field(dl,'Трейлинг',p.strategy==='trail50_20'?(p.armed?'Активирован':'Ожидает +50%'):'—');if(p.closed){field(dl,'Выход',at(p.closed));field(dl,'Получено',sol(p.proceeds));field(dl,'Чистый результат',sol(p.proceeds-p.cost));}else{field(dl,'Последняя оценка, до комиссии',sol(p.last_mark));field(dl,'Оценка от',at(p.last_seen));}card.append(dl);const link=el('a','Исходный колл ↗');if(/^https:\/\/t\.me\/mcap100k_sol\/\d+$/.test(p.source_url))link.href=p.source_url;link.target='_blank';link.rel='noopener noreferrer';card.append(link);$('positions').append(card);}
 const h=s.health||{};$('health').textContent='Запуск: '+at(s.started_at)+' · RAM процесса: '+((s.memory_rss_kib||0)/1024).toFixed(1)+' МиБ · Последняя успешная котировка: '+at(h.last_quote_ok)+' · Зафиксированных разрывов мониторинга: '+(h.gap_count||0)+(h.last_error?' · Последнее событие: '+h.last_error.stage+' / '+h.last_error.error+' / '+at(h.last_error.at):'');
 $('download').href=feed;
}
async function refresh(){if(busy)return;busy=true;$('refresh').disabled=true;try{const r=await fetch(feed+'?v='+Math.floor(Date.now()/60000),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.json();if(s.mode!=='PAPER_ONLY'||!Array.isArray(s.wallets))throw Error('Неверный формат снимка');state=s;$('error').textContent=s.data_quality?.legacy_quote_outages?'⚠ Earlier quote gaps: results are provisional, not a clean strategy comparison.':'';render();}catch(e){$('error').textContent='Не удалось получить свежий снимок: '+e.message;if(state)render();}finally{busy=false;$('refresh').disabled=false;}}
$('refresh').addEventListener('click',refresh);$('filter').addEventListener('change',()=>state&&render());refresh();setInterval(refresh,60000);
