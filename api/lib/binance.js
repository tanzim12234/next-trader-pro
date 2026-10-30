const ALLOWED_BINANCE_SYMBOLS = new Set([
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","DOGEUSDT",
  "ADAUSDT","LINKUSDT","AVAXUSDT","TRXUSDT","LTCUSDT","BCHUSDT"
]);

const TIMEFRAME_INTERVALS = {
  60: { interval:"1m", factor:1 },
  120: { interval:"1m", factor:2 },
  180: { interval:"3m", factor:1 },
  300: { interval:"5m", factor:1 },
  900: { interval:"15m", factor:1 },
  1800: { interval:"30m", factor:1 },
  3600: { interval:"1h", factor:1 },
  14400: { interval:"4h", factor:1 },
  86400: { interval:"1d", factor:1 }
};

export function isAllowedBinanceSymbol(symbol) {
  const value=String(symbol || "").trim().toUpperCase();
  // Allow common Binance Spot pair quote assets; Binance validates the actual listing.
  return /^[A-Z0-9]{5,20}$/.test(value) &&
    /(USDT|USDC|FDUSD|TUSD|USDP|DAI|BTC|ETH|BNB|EUR|TRY|BRL)$/.test(value);
}

export function getSupportedBinanceTimeframes() {
  return Object.keys(TIMEFRAME_INTERVALS).map(Number);
}

function aggregateCandles(candles, seconds) {
  const bucketMs = seconds * 1000;
  const groups = new Map();
  for (const candle of candles) {
    const key = Math.floor(candle.time * 1000 / bucketMs) * bucketMs;
    let group = groups.get(key);
    if (!group) {
      group = {
        time: Math.floor(key / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      };
      groups.set(key, group);
    } else {
      group.high = Math.max(group.high, candle.high);
      group.low = Math.min(group.low, candle.low);
      group.close = candle.close;
      group.volume += candle.volume;
    }
  }
  return [...groups.values()].sort((a,b)=>a.time-b.time);
}

export async function getBinanceCandles(symbol, timeframeSeconds=60, limit=300) {
  const pair=String(symbol || "").toUpperCase();
  const timeframe=TIMEFRAME_INTERVALS[Number(timeframeSeconds)];
  if (!isAllowedBinanceSymbol(pair)) throw new Error("Unsupported Binance Spot symbol.");
  if (!timeframe) throw new Error("Unsupported chart timeframe.");
  const safeLimit=Math.max(20,Math.min(500,Math.floor(Number(limit)||300)));
  const requestLimit=Math.min(1000,safeLimit*timeframe.factor);
  const url=new URL("https://data-api.binance.vision/api/v3/klines");
  url.searchParams.set("symbol",pair);
  url.searchParams.set("interval",timeframe.interval);
  url.searchParams.set("limit",String(requestLimit));
  const response=await fetch(url.toString(),{
    headers:{Accept:"application/json"},
    cache:"no-store",
    signal:AbortSignal.timeout(9000)
  });
  if(!response.ok) {
    throw new Error("Binance market data unavailable ("+response.status+").");
  }
  const rows=await response.json();
  if(!Array.isArray(rows)) throw new Error("Unexpected Binance kline response.");
  const candles=rows.map(row=>({
    time:Math.floor(Number(row[0])/1000),
    open:Number(row[1]),
    high:Number(row[2]),
    low:Number(row[3]),
    close:Number(row[4]),
    volume:Number(row[5])
  })).filter(c=>Number.isFinite(c.time)&&Number.isFinite(c.open)&&Number.isFinite(c.high)&&Number.isFinite(c.low)&&Number.isFinite(c.close));
  const result=timeframe.factor===1?candles:aggregateCandles(candles,Number(timeframeSeconds));
  return result.slice(-safeLimit);
}
