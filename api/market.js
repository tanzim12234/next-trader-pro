import { json, currentUser, subscriptionActive } from "./store.js";
import { getBinanceCandles, isAllowedBinanceSymbol } from "./lib/binance.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return json(res,405,{error:"Method not allowed."});
    }

    const user=await currentUser(req);
    if(!user) return json(res,401,{error:"Please log in again."});
    if(!subscriptionActive(user)) {
      return json(res,403,{error:"An active subscription is required for market data."});
    }

    const symbol=String(req.query?.symbol||"BTCUSDT").toUpperCase();
    const timeframe=Number(req.query?.timeframe||60);
    const limit=Math.max(2,Math.min(500,Number(req.query?.limit)||300));

    if(!isAllowedBinanceSymbol(symbol)) {
      return json(res,400,{error:"This free public feed supports selected Binance Spot crypto pairs only."});
    }

    const candles=await getBinanceCandles(symbol,timeframe,limit);
    return json(res,200,{
      provider:"Binance Public Spot Market Data",
      source:"https://data-api.binance.vision",
      market:"CRYPTO / SPOT",
      symbol,
      timeframeSeconds:timeframe,
      retrievedAt:new Date().toISOString(),
      candles
    });
  } catch(error) {
    console.error("MARKET DATA ERROR:",error);
    return json(res,502,{error:error.message||"Market data unavailable."});
  }
}
