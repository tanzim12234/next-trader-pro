import {
  json,
  currentUser,
  subscriptionActive
} from "./store.js";
import { getBinanceCandles, isAllowedBinanceSymbol } from "./lib/binance.js";

const MODEL = "gemini-3.5-flash-lite";

function evidenceDirection(value) {
  const direction = String(value || "").trim().toUpperCase();
  return ["BULLISH", "BEARISH"].includes(direction) ? direction : "NEUTRAL";
}

function scoreEvidence(evidence = {}) {
  const bullish = [];
  const bearish = [];
  const add = (direction, weight, label) => {
    if (direction === "BULLISH") bullish.push({label, weight});
    if (direction === "BEARISH") bearish.push({label, weight});
  };
  add(evidenceDirection(evidence.market_structure), 1, "Market structure");
  add(evidenceDirection(evidence.structure_break), 2, "BOS / CHOCH");
  add(evidenceDirection(evidence.fvg), 1.25, "FVG alignment");
  add(evidenceDirection(evidence.displacement), 1, "Displacement");
  add(evidenceDirection(evidence.rejection), 1.25, "Rejection candle");
  add(evidenceDirection(evidence.ema_alignment), 0.75, "EMA alignment");
  add(evidenceDirection(evidence.rsi_alignment), 0.5, "RSI confirmation");

  const sweep = String(evidence.liquidity_sweep || "NONE").trim().toUpperCase();
  if (sweep === "SELL_SIDE") bullish.push({label:"Sell-side liquidity sweep",weight:2});
  if (sweep === "BUY_SIDE") bearish.push({label:"Buy-side liquidity sweep",weight:2});

  const sum = items => Number(items.reduce((total,item)=>total+item.weight,0).toFixed(2));
  const bullishScore = sum(bullish);
  const bearishScore = sum(bearish);
  const gap = Math.abs(bullishScore-bearishScore);
  const leader = bullishScore > bearishScore ? "CALL" : bearishScore > bullishScore ? "PUT" : "NO TRADE";
  const leaderItems = leader === "CALL" ? bullish : leader === "PUT" ? bearish : [];
  const hasStructure = leader === "CALL"
    ? evidenceDirection(evidence.structure_break) === "BULLISH"
    : leader === "PUT"
      ? evidenceDirection(evidence.structure_break) === "BEARISH"
      : false;
  const hasConfluence = leader === "CALL"
    ? sweep === "SELL_SIDE" || evidenceDirection(evidence.fvg) === "BULLISH" ||
      evidenceDirection(evidence.displacement) === "BULLISH" ||
      evidenceDirection(evidence.rejection) === "BULLISH"
    : leader === "PUT"
      ? sweep === "BUY_SIDE" || evidenceDirection(evidence.fvg) === "BEARISH" ||
        evidenceDirection(evidence.displacement) === "BEARISH" ||
        evidenceDirection(evidence.rejection) === "BEARISH"
      : false;
  const signal = leaderItems.length && (leader === "CALL" ? bullishScore : bearishScore) >= 3.5 &&
    gap >= 1.5 && hasStructure && hasConfluence ? leader : "NO TRADE";

  return {
    signal,
    bullishScore,
    bearishScore,
    gap: Number(gap.toFixed(2)),
    evidence: {
      market_structure:evidenceDirection(evidence.market_structure),
      liquidity_sweep:["SELL_SIDE","BUY_SIDE"].includes(sweep) ? sweep : "NONE",
      structure_break:evidenceDirection(evidence.structure_break),
      fvg:evidenceDirection(evidence.fvg),
      displacement:evidenceDirection(evidence.displacement),
      rejection:evidenceDirection(evidence.rejection),
      ema_alignment:evidenceDirection(evidence.ema_alignment),
      rsi_alignment:evidenceDirection(evidence.rsi_alignment)
    },
    rule: signal === "NO TRADE"
      ? "Insufficient directional confluence; wait for confirmation."
      : "Structure break + directional confluence + minimum score passed."
  };
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const multiplier=2/(period+1);
  let current=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++) current=(values[i]-current)*multiplier+current;
  return current;
}

function rsi(values, period=14) {
  if(values.length<=period) return null;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++) {
    const delta=values[i]-values[i-1];
    if(delta>0) gains+=delta; else losses-=delta;
  }
  let averageGain=gains/period,averageLoss=losses/period;
  for(let i=period+1;i<values.length;i++) {
    const delta=values[i]-values[i-1];
    averageGain=(averageGain*(period-1)+Math.max(delta,0))/period;
    averageLoss=(averageLoss*(period-1)+Math.max(-delta,0))/period;
  }
  if(averageLoss===0) return 100;
  return 100-(100/(1+averageGain/averageLoss));
}

function atr(candles, period=14) {
  if(candles.length<=period) return null;
  const trs=[];
  for(let i=1;i<candles.length;i++) {
    const cur=candles[i],prev=candles[i-1];
    trs.push(Math.max(cur.high-cur.low,Math.abs(cur.high-prev.close),Math.abs(cur.low-prev.close)));
  }
  return trs.slice(-period).reduce((a,b)=>a+b,0)/period;
}

function scoreBinanceCandles(sourceCandles) {
  const candles=sourceCandles.slice(0,-1); // Ignore the still-forming candle for confirmation.
  if(candles.length<60) throw new Error("Not enough closed candles for the custom market algorithm.");
  const closes=candles.map(c=>c.close);
  const last=candles[candles.length-1];
  const prior=candles.slice(-40,-1);
  const ema20=ema(closes,20),ema50=ema(closes,50),rsi14=rsi(closes,14),atr14=atr(candles,14);

  const pivotsHigh=[],pivotsLow=[];
  for(let i=Math.max(2,candles.length-40);i<candles.length-2;i++) {
    const x=candles[i];
    if(x.high>candles[i-1].high && x.high>candles[i-2].high &&
       x.high>=candles[i+1].high && x.high>=candles[i+2].high) pivotsHigh.push(x.high);
    if(x.low<candles[i-1].low && x.low<candles[i-2].low &&
       x.low<=candles[i+1].low && x.low<=candles[i+2].low) pivotsLow.push(x.low);
  }
  const swingHigh=pivotsHigh.at(-1);
  const swingLow=pivotsLow.at(-1);
  const previousHigh=prior.length?Math.max(...prior.map(x=>x.high)):null;
  const previousLow=prior.length?Math.min(...prior.map(x=>x.low)):null;

  let liquiditySweep="NONE";
  if(previousLow!==null && last.low<previousLow && last.close>previousLow) liquiditySweep="SELL_SIDE";
  else if(previousHigh!==null && last.high>previousHigh && last.close<previousHigh) liquiditySweep="BUY_SIDE";

  let structureBreak="NEUTRAL";
  if(Number.isFinite(swingHigh) && last.close>swingHigh) structureBreak="BULLISH";
  else if(Number.isFinite(swingLow) && last.close<swingLow) structureBreak="BEARISH";

  const twoBack=candles[candles.length-3];
  let fvg="NEUTRAL";
  if(twoBack && last.low>twoBack.high) fvg="BULLISH";
  else if(twoBack && last.high<twoBack.low) fvg="BEARISH";

  let displacement="NEUTRAL";
  if(atr14 && Math.abs(last.close-last.open)>=atr14*1.15) {
    displacement=last.close>last.open?"BULLISH":"BEARISH";
  }
  const emaAlignment=ema20!==null&&ema50!==null
    ? (ema20>ema50&&last.close>ema20?"BULLISH":ema20<ema50&&last.close<ema20?"BEARISH":"NEUTRAL")
    : "NEUTRAL";
  const rsiAlignment=rsi14!==null
    ? (rsi14>=55?"BULLISH":rsi14<=45?"BEARISH":"NEUTRAL")
    : "NEUTRAL";
  const marketStructure=emaAlignment!=="NEUTRAL"?emaAlignment:"NEUTRAL";
  const rejection=liquiditySweep==="SELL_SIDE"?"BULLISH":liquiditySweep==="BUY_SIDE"?"BEARISH":"NEUTRAL";

  const scored=scoreEvidence({
    market_structure:marketStructure,
    liquidity_sweep:liquiditySweep,
    structure_break:structureBreak,
    fvg,
    displacement,
    rejection,
    ema_alignment:emaAlignment,
    rsi_alignment:rsiAlignment
  });

  return {
    ...scored,
    provider:"BINANCE_PUBLIC_SPOT",
    market:"CRYPTO",
    symbol:undefined,
    last_closed_candle_time:last.time,
    ema20:Number(ema20?.toFixed(8)),
    ema50:Number(ema50?.toFixed(8)),
    rsi14:Number(rsi14?.toFixed(2)),
    close:last.close,
    atr14:Number(atr14?.toFixed(8))
  };
}

function normalizeSignal(value) {
  const signal = String(value || "").trim().toUpperCase();

  return ["CALL", "PUT", "NO TRADE"].includes(signal)
    ? signal
    : "NO TRADE";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { error: "Method not allowed." });
    }

    const user = await currentUser(req);

    if (!user) {
      return json(res, 401, { error: "Please log in again." });
    }

    if (!subscriptionActive(user)) {
      return json(res, 403, {
        error: "Subscription inactive or expired. Please renew."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return json(res, 500, {
        error: "GEMINI_API_KEY is missing in Vercel."
      });
    }

    const body = req.body || {};
    const image = body.image;
    const settings = body.settings || {};

    const liveData =
      body.live_data && typeof body.live_data === "object"
        ? body.live_data
        : null;

    const marketType=String(settings.market_type||"").toLowerCase();
    const selectedSymbol=String(settings.symbol||"").toUpperCase();
    const isBinanceCrypto=marketType==="crypto" && isAllowedBinanceSymbol(selectedSymbol);
    let deterministicMarketScore=null;

    if(isBinanceCrypto) {
      const timeframeSeconds=Number(settings.timeframe_seconds)||60;
      const candles=await getBinanceCandles(selectedSymbol,timeframeSeconds,180);
      deterministicMarketScore=scoreBinanceCandles(candles);
      deterministicMarketScore.symbol=selectedSymbol;
    }

    if (typeof image !== "string" || image.length > 8_000_000) {
      return json(res, 400, {
        error: "Chart image is missing or too large."
      });
    }

    const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);

    if (!match) {
      return json(res, 400, { error: "Invalid image format." });
    }

    const mimeType = match[1];
    const base64Image = match[2];

    const market = String(settings.market || "REAL").slice(0, 30);
    const timeframe = String(settings.timeframe || "60 seconds").slice(0, 30);
    const mode = String(settings.mode || "balanced").slice(0, 40);
    const minConfidence = Math.max(
      0,
      Math.min(100, Number(settings.min_confidence ?? 60) || 0)
    );

    const live = settings.execution_mode === "FIXED_1M_CLOSE_TO_RUNNING_ENTRY";

    const prompt = `You are NEXT TRADER PRO's visual evidence extractor. A deterministic server-side rule engine will decide the final direction.

Use only visible chart evidence for visual interpretation. Do not invent candles, OHLC values, hidden broker feeds, or future movement. When the selected market is Crypto, a separate deterministic rule engine also evaluates closed Binance Spot OHLC candles; your visual evidence must independently agree with that engine before a CALL/PUT can be returned.

Market: ${market}
Market class: ${marketType || "unknown"}
Symbol: ${String(settings.symbol || "UNKNOWN").slice(0,40)}
Timeframe: ${timeframe}
Data source note: selected crypto pairs are separately checked with Binance Spot public OHLC candles by the server-side rule engine; all other market classes are scored from visible chart evidence only.
Mode: ${mode}
Minimum AI confidence: ${minConfidence}%
Live target-candle workflow: ${live ? "YES" : "NO"}

Analyze visible candles, swing highs/lows, equal highs/lows, trend, BOS/CHOCH, liquidity sweeps, FVG/imbalance, displacement, rejection candles, visible EMA alignment and RSI if shown. Do not claim an indicator is visible if it is not. If the chart is blurry, too zoomed out, symbol/timeframe cannot be identified, or evidence conflicts, use NEUTRAL/NONE and recommend NO TRADE.

Evidence vocabulary:
- market_structure: BULLISH | BEARISH | NEUTRAL
- liquidity_sweep: SELL_SIDE | BUY_SIDE | NONE (SELL_SIDE sweep may support CALL after reclaim; BUY_SIDE sweep may support PUT after rejection)
- structure_break: BULLISH | BEARISH | NEUTRAL
- fvg, displacement, rejection, ema_alignment, rsi_alignment: BULLISH | BEARISH | NEUTRAL

Rules:
1. A liquidity sweep alone is not an entry.
2. Prefer a directional structure break (BOS/CHOCH) plus a second confluence such as aligned FVG, displacement, rejection, or corresponding liquidity sweep.
3. Do not infer a setup from RSI/EMA alone.
4. If no clean structure break or evidence is mixed, signal must be NO TRADE.
5. Confidence describes visual certainty, not probability of profit.
6. For live workflow only return RUNNING CANDLE as the proposed entry label. Never say an order has been placed.

Return ONLY valid JSON with this exact shape:
{
  "signal":"CALL|PUT|NO TRADE",
  "confidence":0,
  "trend":"BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
  "expiry":"${timeframe}",
  "entry_candle":"CURRENT CANDLE|RUNNING CANDLE|WAIT",
  "entry_instruction":"manual entry instruction or wait",
  "setup":"short setup name",
  "reasons":["visible evidence only"],
  "risk":"LOW|MEDIUM|HIGH",
  "evidence":{
    "market_structure":"BULLISH|BEARISH|NEUTRAL",
    "liquidity_sweep":"SELL_SIDE|BUY_SIDE|NONE",
    "structure_break":"BULLISH|BEARISH|NEUTRAL",
    "fvg":"BULLISH|BEARISH|NEUTRAL",
    "displacement":"BULLISH|BEARISH|NEUTRAL",
    "rejection":"BULLISH|BEARISH|NEUTRAL",
    "ema_alignment":"BULLISH|BEARISH|NEUTRAL",
    "rsi_alignment":"BULLISH|BEARISH|NEUTRAL"
  },
  "market_data":{"asset":"","current_price":"","visible_time":"","candle_close":""}
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Image } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 260,
            thinkingConfig: { thinkingLevel: "minimal" }
          }
        }),
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("GEMINI ERROR:", data);
      return json(res, 502, {
        error: data?.error?.message || "Gemini API request failed."
      });
    }

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(part => part?.text || "")
      .join("")
      .trim();

    if (!text) {
      return json(res, 502, { error: "Gemini returned an empty response." });
    }

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return json(res, 200, {
        signal: "NO TRADE",
        confidence: 0,
        trend: "UNCLEAR",
        expiry: timeframe,
        entry_candle: "WAIT",
        entry_instruction: "AI response could not be safely parsed.",
        setup: "Response parsing issue",
        reasons: ["Invalid AI JSON; signal blocked."],
        risk: "HIGH",
        disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
      });
    }

    let confidence = Number(result.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(100, Math.round(confidence)));

    const aiSignal = normalizeSignal(result.signal);
    const imageAlgorithm = scoreEvidence(result.evidence);
    const algorithm = deterministicMarketScore || imageAlgorithm;
    // The server-side confluence gate is authoritative. AI direction alone cannot create a trade idea.
    const finalSignal = confidence >= minConfidence &&
      ["CALL","PUT"].includes(aiSignal) &&
      algorithm.signal === aiSignal
        ? aiSignal
        : "NO TRADE";

    const entryCandle =
      finalSignal === "NO TRADE"
        ? "WAIT"
        : live
          ? "RUNNING CANDLE"
          : String(result.entry_candle || "CURRENT CANDLE");

    const md =
      result.market_data && typeof result.market_data === "object"
        ? result.market_data
        : {};

    return json(res, 200, {
      signal: finalSignal,
      confidence,
      trend: ["BULLISH", "BEARISH", "SIDEWAYS", "UNCLEAR"].includes(
        String(result.trend || "").toUpperCase()
      ) ? String(result.trend).toUpperCase() : "UNCLEAR",
      expiry: String(result.expiry || timeframe),
      entry_candle: entryCandle,
      entry_instruction: String(
        result.entry_instruction || "Wait for confirmation."
      ),
      setup: String(result.setup || "No clear setup"),
      reasons: [
        ...(Array.isArray(result.reasons)
          ? result.reasons.slice(0, 4).map(item => String(item).slice(0, 240))
          : []),
        algorithm.rule,
        "NEXT TRADER scores: CALL " + algorithm.bullishScore +
          " / PUT " + algorithm.bearishScore
      ],
      algorithm: {
        name: "NEXT TRADER CONFLUENCE v1",
        signal: algorithm.signal,
        bullish_score: algorithm.bullishScore,
        bearish_score: algorithm.bearishScore,
        score_gap: algorithm.gap,
        evidence: algorithm.evidence,
        rule: algorithm.rule,
        provider: deterministicMarketScore ? deterministicMarketScore.provider : "AI_VISUAL_EVIDENCE",
        market_symbol: deterministicMarketScore?.symbol || settings.symbol || null,
        last_closed_candle_time: deterministicMarketScore?.last_closed_candle_time || null,
        ema20: deterministicMarketScore?.ema20 ?? null,
        ema50: deterministicMarketScore?.ema50 ?? null,
        rsi14: deterministicMarketScore?.rsi14 ?? null
      },
      risk: ["LOW", "MEDIUM", "HIGH"].includes(
        String(result.risk || "").toUpperCase()
      ) ? String(result.risk).toUpperCase() : "HIGH",
      market_data: {
        asset: String(md.asset || liveData?.asset || settings.symbol || "UNKNOWN"),
        current_price: String(deterministicMarketScore?.close ?? md.current_price ?? liveData?.price ?? liveData?.close ?? "UNKNOWN"),
        visible_time: String(deterministicMarketScore?.last_closed_candle_time ? new Date(deterministicMarketScore.last_closed_candle_time*1000).toISOString() : md.visible_time || liveData?.server_time || "UNKNOWN"),
        candle_close: String(deterministicMarketScore?.close ?? md.candle_close ?? liveData?.close ?? "UNKNOWN"),
        source: deterministicMarketScore ? "BINANCE PUBLIC OHLC + SCREEN" : liveData ? "LIVE DATA + SCREEN" : "SCREEN SNAPSHOT"
      },
      disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
    });
  } catch (error) {
    console.error("NEXT TRADER ERROR:", error);
    return json(res, 500, { error: "Analysis service failed." });
  }
}
