import {
  json,
  currentUser,
  subscriptionActive
} from "./lib/store.js";

const MODEL = "gemini-3.5-flash-lite";

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

    const prompt = `You are NEXT TRADER AI PRO, a conservative chart-image technical analyst.

IMAGE IS THE ONLY SOURCE OF TRUTH.
Do not invent future candles, hidden prices, broker feed, or future movement.

Market: ${market}
Timeframe: ${timeframe}
Mode: ${mode}
Minimum confidence: ${minConfidence}%
Live mode: ${live ? "YES" : "NO"}

LIVE DATA BRIDGE:
${liveData ? JSON.stringify(liveData).slice(0, 1800) : "none"}

Analyze only visible evidence: candles, bodies, wicks, momentum, swing highs/lows,
market structure, BOS/CHOCH if visible, support/resistance, equal highs/lows,
liquidity sweeps, rejection, engulfing, breakout/false breakout, FVG/imbalance,
supply/demand, visible moving averages, and current price location.

Compare CALL evidence against PUT evidence.
If evidence conflicts, setup is incomplete, chart is unclear, or confidence is
below ${minConfidence}%, return NO TRADE.

For live CALL/PUT, use entry_candle = RUNNING CANDLE.
Do not invent future price movement.

Return ONLY valid JSON:
{
  "signal":"CALL|PUT|NO TRADE",
  "confidence":0,
  "trend":"BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
  "expiry":"${timeframe}",
  "entry_candle":"CURRENT CANDLE|RUNNING CANDLE|NEXT CANDLE|AFTER NEXT CANDLE|WAIT",
  "entry_instruction":"short instruction",
  "setup":"short setup name",
  "reasons":["reason 1","reason 2","reason 3"],
  "risk":"LOW|MEDIUM|HIGH",
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

    const signal = normalizeSignal(result.signal);
    const finalSignal = confidence >= minConfidence ? signal : "NO TRADE";

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
      reasons: Array.isArray(result.reasons)
        ? result.reasons.slice(0, 6).map(item => String(item).slice(0, 240))
        : [],
      risk: ["LOW", "MEDIUM", "HIGH"].includes(
        String(result.risk || "").toUpperCase()
      ) ? String(result.risk).toUpperCase() : "HIGH",
      market_data: {
        asset: String(md.asset || liveData?.asset || settings.symbol || "UNKNOWN"),
        current_price: String(md.current_price || liveData?.price || liveData?.close || "UNKNOWN"),
        visible_time: String(md.visible_time || liveData?.server_time || "UNKNOWN"),
        candle_close: String(md.candle_close || liveData?.close || "UNKNOWN"),
        source: liveData ? "LIVE DATA + SCREEN" : "SCREEN SNAPSHOT"
      },
      disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
    });
  } catch (error) {
    console.error("NEXT TRADER ERROR:", error);
    return json(res, 500, { error: "Analysis service failed." });
  }
}
