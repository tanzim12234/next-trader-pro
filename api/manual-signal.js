import {json,currentUser,subscriptionActive} from "./store.js";
import {getBinanceCandles,isAllowedBinanceSymbol} from "./lib/binance.js";
import {scoreBinanceCandles} from "./analyze.js";

export default async function handler(req,res) {
  if(req.method!=="POST") {res.setHeader("Allow","POST");return json(res,405,{error:"Method not allowed."});}
  try {
    const user=await currentUser(req);
    if(!user)return json(res,401,{error:"Please log in again."});
    if(!subscriptionActive(user))return json(res,403,{error:"Active subscription required."});
    const symbol=String(req.body?.symbol||"").trim().toUpperCase();
    const timeframe=Number(req.body?.timeframe)||60;
    if(!isAllowedBinanceSymbol(symbol))return json(res,400,{error:"Choose a valid Binance Spot pair."});
    if(![60,120,180,300,900,1800,3600,14400,86400].includes(timeframe))return json(res,400,{error:"Unsupported chart timeframe."});
    const candles=await getBinanceCandles(symbol,timeframe,180);
    const result=scoreBinanceCandles(candles);
    return json(res,200,{
      signal:result.signal,
      confidence:null,
      symbol,
      timeframe_seconds:timeframe,
      market:"CRYPTO",
      algorithm:"NEXT TRADER CONFLUENCE v1",
      bullish_score:result.bullishScore,
      bearish_score:result.bearishScore,
      evidence:result.evidence,
      rule:result.rule,
      last_closed_candle_time:result.last_closed_candle_time,
      last_close:result.close,
      indicators:{ema20:result.ema20,ema50:result.ema50,rsi14:result.rsi14,atr14:result.atr14},
      source:"BINANCE PUBLIC SPOT OHLC",
      tested_accuracy:null,
      notice:"On-demand technical signal, not a prediction or guarantee. No broker order is placed."
    });
  }catch(error) {
    console.error("MANUAL_SIGNAL_ERROR:",error);
    return json(res,502,{error:"Could not get reliable closed-candle market data. No signal issued."});
  }
}
