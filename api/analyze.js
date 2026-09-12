import { isAuthorized } from "./auth.js";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GROK_MODEL = "grok-4.6";

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    signal: { type: "string", enum: ["CALL", "PUT", "NO TRADE"] },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    trend: { type: "string", enum: ["BULLISH", "BEARISH", "SIDEWAYS", "UNCLEAR"] },
    expiry: { type: "string" },
    entry_candle: { type: "string", enum: ["CURRENT CANDLE", "NEXT CANDLE", "AFTER NEXT CANDLE", "WAIT", "RUNNING CANDLE"] },
    entry_instruction: { type: "string" },
    setup: { type: "string" },
    reasons: { type: "array", items: { type: "string" }, maxItems: 6 },
    risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    disclaimer: { type: "string" }
  },
  required: [
    "signal","confidence","trend","expiry","entry_candle",
    "entry_instruction","setup","reasons","risk","disclaimer"
  ]
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

function normalize(result, timeframe) {
  const signal = ["CALL", "PUT", "NO TRADE"].includes(String(result?.signal || "").toUpperCase())
    ? String(result.signal).toUpperCase()
    : "NO TRADE";

  return {
    signal,
    confidence: clamp(result?.confidence, 0, 100),
    trend: ["BULLISH","BEARISH","SIDEWAYS","UNCLEAR"].includes(String(result?.trend || "").toUpperCase())
      ? String(result.trend).toUpperCase() : "UNCLEAR",
    expiry: String(result?.expiry || timeframe),
    entry_candle: String(result?.entry_candle || "WAIT"),
    entry_instruction: String(result?.entry_instruction || "Wait for stronger confirmation."),
    setup: String(result?.setup || "No clear setup"),
    reasons: Array.isArray(result?.reasons) ? result.reasons.slice(0, 6).map(String) : [],
    risk: ["LOW","MEDIUM","HIGH"].includes(String(result?.risk || "").toUpperCase())
      ? String(result.risk).toUpperCase() : "HIGH",
    disclaimer: "Technical analysis is probabilistic; no signal is guaranteed."
  };
}

function buildPrompt(settings, provider) {
  const market = settings.market || "OTC";
  const timeframe = settings.timeframe || "1 minute";
  const mode = settings.mode || "STRICT SMC";
  const minConfidence = Number(settings.min_confidence || 60);
  const live = settings.execution_mode === "FIXED_1M_CLOSE_TO_RUNNING_ENTRY";

  return `You are NEXT TRADER AI PRO, a conservative chart-image technical analyst.
Provider: ${provider}.
The supplied image is the ONLY market source of truth. Analyze only visible information.

MARKET: ${market}
TIMEFRAME: ${timeframe}
MODE: ${mode}
MINIMUM CONFIDENCE: ${minConfidence}%
LIVE MODE: ${live ? "YES — this image is captured near the close of a 1-minute candle." : "NO"}

Analyze:
- recent candles, body/wicks and momentum
- swing highs/lows and market structure
- BOS/CHOCH if visible
- support/resistance and nearby opposing levels
- equal highs/lows and liquidity sweep
- rejection/engulfing/breakout/false breakout
- FVG/imbalance and supply/demand if visible
- moving averages only if actually visible
- whether CALL or PUT has stronger visible evidence
- whether the setup is clean enough to trade

Do not invent future candles, hidden broker data, live price, or unseen indicators.
Do not guarantee a win.

SIGNAL RULES:
- If evidence is weak/conflicting, use NO TRADE.
- If confidence is below ${minConfidence}%, signal MUST be NO TRADE.
- In LIVE MODE, analyze the just-closed candle and make the signal for the candle that is starting at :00.
- In LIVE MODE, for CALL/PUT set entry_candle to "RUNNING CANDLE"; never say "NEXT CANDLE".
- For non-live analysis, use CURRENT CANDLE only when already confirmed; otherwise WAIT/NEXT CANDLE as appropriate.

Return only the requested JSON structure.`;
}

function extractJsonText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();

  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (!Array.isArray(item?.content)) continue;
    for (const c of item.content) {
      if (typeof c?.text === "string" && c.text.trim()) return c.text.trim();
    }
  }
  return "";
}

async function callGemini(apiKey, image, mimeType, prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: image } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 260,
          thinkingConfig: { thinkingLevel: "minimal" }
        }
      })
    }
  );

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Gemini API request failed.");

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p?.text || "").join("").trim();

  if (!text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text);
}

async function callGrok(apiKey, image, prompt) {
  const r = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      store: false,
      input: [{
        role: "user",
        content: [
          { type: "input_image", image_url: `data:image/jpeg;base64,${image}` },
          { type: "input_text", text: prompt }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "next_trader_signal",
          schema: OUTPUT_SCHEMA,
          strict: true
        }
      },
      max_output_tokens: 260
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || "Grok API request failed.");

  const text = extractJsonText(data);
  if (!text) throw new Error("Grok returned an empty response.");
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  if (!isAuthorized(req)) return res.status(401).json({ error: "Login required." });

  const geminiKey = process.env.GEMINI_API_KEY;
  const grokKey = process.env.XAI_API_KEY;

  if (!geminiKey && !grokKey) {
    return res.status(500).json({ error: "No AI API key configured. Add GEMINI_API_KEY and/or XAI_API_KEY in Vercel." });
  }

  try {
    const body = req.body || {};
    const image = body.image;
    const settings = body.settings || {};

    if (typeof image !== "string") return res.status(400).json({ error: "Chart image is required." });

    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: "Invalid image format." });

    const mimeType = match[1];
    const base64Image = match[2];
    const timeframe = settings.timeframe || "1 minute";
    const minConfidence = Number(settings.min_confidence || 60);
    const promptGemini = buildPrompt(settings, "Gemini");
    const promptGrok = buildPrompt(settings, "Grok");

    const tasks = [];
    if (geminiKey) tasks.push(
      callGemini(geminiKey, base64Image, mimeType, promptGemini)
        .then(x => ({ provider: "GEMINI", result: normalize(x, timeframe) }))
        .catch(error => ({ provider: "GEMINI", error: error.message }))
    );
    if (grokKey) tasks.push(
      callGrok(grokKey, base64Image, promptGrok)
        .then(x => ({ provider: "GROK", result: normalize(x, timeframe) }))
        .catch(error => ({ provider: "GROK", error: error.message }))
    );

    const outputs = await Promise.all(tasks);
    const good = outputs.filter(x => x.result);
    const failed = outputs.filter(x => x.error);

    if (!good.length) {
      return res.status(502).json({
        error: "Both AI analyses failed.",
        providers: outputs.map(x => ({ provider: x.provider, error: x.error }))
      });
    }

    // One provider: use it, but never bypass the minimum-confidence gate.
    if (good.length === 1) {
      const one = good[0].result;
      const finalSignal = one.confidence >= minConfidence ? one.signal : "NO TRADE";
      return res.status(200).json({
        ...one,
        signal: finalSignal,
        entry_candle: finalSignal === "NO TRADE" ? "WAIT" :
          (settings.execution_mode === "FIXED_1M_CLOSE_TO_RUNNING_ENTRY" ? "RUNNING CANDLE" : one.entry_candle),
        ai_consensus: "SINGLE PROVIDER",
        ai_providers: [good[0].provider],
        ai_warnings: failed.map(x => `${x.provider}: ${x.error}`)
      });
    }

    // Dual-AI consensus: disagreement is a NO TRADE, not a forced signal.
    const a = good[0].result;
    const b = good[1].result;
    const sameSignal = a.signal === b.signal && a.signal !== "NO TRADE";
    const avgConfidence = Math.round((a.confidence + b.confidence) / 2);

    if (!sameSignal) {
      return res.status(200).json({
        signal: "NO TRADE",
        confidence: Math.min(a.confidence, b.confidence),
        trend: "UNCLEAR",
        expiry: timeframe,
        entry_candle: "WAIT",
        entry_instruction: "Gemini and Grok disagree; skip this candle.",
        setup: "AI disagreement",
        reasons: [
          `Gemini: ${a.signal} (${a.confidence}%)`,
          `Grok: ${b.signal} (${b.confidence}%)`,
          "Consensus gate blocked the trade."
        ],
        risk: "HIGH",
        disclaimer: "Technical analysis is probabilistic; no signal is guaranteed.",
        ai_consensus: "DISAGREEMENT",
        ai_providers: ["GEMINI", "GROK"],
        ai_warnings: failed.map(x => `${x.provider}: ${x.error}`)
      });
    }

    const finalSignal = avgConfidence >= minConfidence ? a.signal : "NO TRADE";
    const reasons = [...new Set([...(a.reasons || []), ...(b.reasons || [])])].slice(0, 6);

    return res.status(200).json({
      signal: finalSignal,
      confidence: avgConfidence,
      trend: a.trend === b.trend ? a.trend : "UNCLEAR",
      expiry: timeframe,
      entry_candle: finalSignal === "NO TRADE" ? "WAIT" :
        (settings.execution_mode === "FIXED_1M_CLOSE_TO_RUNNING_ENTRY" ? "RUNNING CANDLE" : "CURRENT CANDLE"),
      entry_instruction: finalSignal === "NO TRADE"
        ? "Confidence did not pass the safety threshold."
        : "Both AI models agree; enter only within the defined candle window.",
      setup: a.setup === b.setup ? a.setup : `${a.setup} + ${b.setup}`,
      reasons,
      risk: (a.risk === "HIGH" || b.risk === "HIGH") ? "HIGH" : (a.risk === "MEDIUM" || b.risk === "MEDIUM" ? "MEDIUM" : "LOW"),
      disclaimer: "Technical analysis is probabilistic; no signal is guaranteed.",
      ai_consensus: "GEMINI + GROK AGREED",
      ai_providers: ["GEMINI", "GROK"],
      ai_warnings: failed.map(x => `${x.provider}: ${x.error}`)
    });
  } catch (error) {
    console.error("NEXT TRADER ERROR:", error);
    return res.status(500).json({ error: error?.message || "AI analysis failed." });
  }
}
