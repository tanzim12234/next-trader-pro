// Public Yahoo Finance indicative FX OHLC (not a broker/execution feed).
// Yahoo may rate-limit or change its unofficial chart endpoint.
const PAIRS=new Set(["EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURJPY","GBPJPY"]);
const INTERVALS={60:["1m",1],180:["1m",3],300:["5m",1],900:["15m",1],1800:["30m",1],3600:["60m",1],14400:["60m",4],86400:["1d",1]};
function aggregate(rows,factor) {
  if(factor===1)return rows;
  const seconds=factor*(rows[1].time-rows[0].time);
  const buckets=new Map();
  for(const row of rows){
    const key=Math.floor(row.time/seconds)*seconds;
    let b=buckets.get(key);
    if(!b){b={...row,time:key};buckets.set(key,b);}
    else {b.high=Math.max(b.high,row.high);b.low=Math.min(b.low,row.low);b.close=row.close;}
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
export async function getForexCandles(rawSymbol,timeframe) {
  const pair=String(rawSymbol||"").toUpperCase().replace(/^OANDA:/,"");
  if(!PAIRS.has(pair))throw new Error("Unsupported Forex pair.");
  const setting=INTERVALS[Number(timeframe)];
  if(!setting)throw new Error("Unsupported Forex timeframe.");
  const [interval,factor]=setting;
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(pair+"=X")+"?interval="+interval+"&range="+(interval==="1d"?"1y":"7d");
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(8000),cache:"no-store"});
  if(!response.ok)throw new Error("Forex data provider unavailable ("+response.status+").");
  const data=await response.json();
  const result=data?.chart?.result?.[0];
  const timestamps=result?.timestamp;
  const q=result?.indicators?.quote?.[0];
  if(!Array.isArray(timestamps)||!q)throw new Error("No Forex OHLC data available.");
  const rows=timestamps.map((time,i)=>({time:Number(time),open:Number(q.open?.[i]),high:Number(q.high?.[i]),low:Number(q.low?.[i]),close:Number(q.close?.[i])}))
    .filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.high>=c.low&&c.open>0);
  if(rows.length<70)throw new Error("Not enough Forex candles available.");
  const candles=aggregate(rows,factor);
  const seconds=Number(timeframe);
  const now=Math.floor(Date.now()/1000);
  // Do not issue a signal from stale/closed market data.
  if(now-candles.at(-1).time>Math.max(900,seconds*3))throw new Error("Forex feed is stale or market is closed. No signal.");
  // scorer ignores last candle; keep it even when the latest bar is forming.
  return {pair,candles:candles.slice(-250),source:"YAHOO FINANCE INDICATIVE FX OHLC (NOT BROKER PRICES)"};
}
