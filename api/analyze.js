import { isAuthorized } from "./auth.js";

const MODEL = "gemini-3.5-flash-lite";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }


  /* =========================
     AUTH CHECK
  ========================= */

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: "Login required."
    });
  }


  /* =========================
     GEMINI KEY
  ========================= */

  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "GEMINI_API_KEY is missing in Vercel."
    });
  }


  try {

    const body = req.body || {};

    const image = body.image;

    const settings =
      body.settings || {};


    /* =========================
       IMAGE VALIDATION
    ========================= */

    if (
      !image ||
      typeof image !== "string"
    ) {

      return res.status(400).json({
        error:
          "Chart image is required."
      });

    }


    const match = image.match(
      /^data:(image\/[^;]+);base64,(.+)$/
    );


    if (!match) {

      return res.status(400).json({
        error:
          "Invalid image format."
      });

    }


    const mimeType = match[1];

    const base64Image = match[2];


    /* =========================
       SETTINGS
    ========================= */

    const market =
      settings.market || "OTC";

    const timeframe =
      settings.timeframe || "1 minute";

    const mode =
      settings.mode || "STRICT SMC";

    const minConfidence =
      Number(
        settings.min_confidence || 60
      );


    /* =========================
       AI PROMPT
    ========================= */

    const prompt = `

You are NEXT TRADER AI PRO.

You are a conservative technical chart screenshot analyzer.

IMPORTANT:
Analyze ONLY the visible chart.

DO NOT invent:
- future candles
- hidden candles
- broker data
- live market data
- prices that are not visible
- indicators that are not visible

The result must be probabilistic.
Never guarantee profit.
Never claim certainty.


USER SETTINGS

Market:
${market}

Timeframe:
${timeframe}

Analysis mode:
${mode}

Minimum confidence:
${minConfidence}%


ANALYSIS FRAMEWORK

Analyze the visible chart using:

1. Candle structure
2. Momentum
3. Trend
4. Moving averages if visible
5. Support and resistance
6. Liquidity
7. Equal highs / equal lows
8. Liquidity sweep
9. FVG / imbalance if visible
10. Rejection
11. Engulfing
12. Breakout / false breakout
13. Market structure
14. Nearby opposing levels
15. Entry timing


BINARY-STYLE DECISION

If the visible evidence strongly supports CALL,
you may return CALL.

If the visible evidence strongly supports PUT,
you may return PUT.

If evidence is weak, conflicting, blurry,
or there is no clean setup:

RETURN NO TRADE.


STRICT RULES

- Confidence must be 0-100.
- Confidence represents visible evidence, NOT certainty.
- If confidence is below ${minConfidence}%,
  return NO TRADE.
- If chart is blurry, blocked, cropped badly,
  or important candles cannot be read,
  return NO TRADE.
- If signals conflict, return NO TRADE.
- Do not force a signal.
- Do not promise profit.
- Do not claim the next candle is guaranteed.
- Prefer WAIT when confirmation is missing.
- Never use hidden information.


ENTRY CANDLE

Possible values:

CURRENT CANDLE
NEXT CANDLE
AFTER NEXT CANDLE
WAIT


For CURRENT CANDLE:
Only use it when the visible candle clearly provides
an actionable confirmed setup.

Otherwise prefer NEXT CANDLE or WAIT.


RETURN ONLY VALID JSON.

Use exactly this structure:

{
  "signal": "CALL|PUT|NO TRADE",
  "confidence": 0,
  "trend": "BULLISH|BEARISH|SIDEWAYS|UNCLEAR",
  "expiry": "${timeframe}",
  "entry_candle": "CURRENT CANDLE|NEXT CANDLE|AFTER NEXT CANDLE|WAIT",
  "entry_instruction": "short specific instruction",
  "setup": "short setup name",
  "reasons": [
    "reason 1",
    "reason 2",
    "reason 3",
    "reason 4"
  ],
  "risk": "LOW|MEDIUM|HIGH",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

`;


    /* =========================
       GEMINI REQUEST
    ========================= */

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({

          contents: [
            {
              parts: [

                {
                  text: prompt
                },

                {
                  inline_data: {
                    mime_type:
                      mimeType,
                    data:
                      base64Image
                  }
                }

              ]
            }
          ],

          generationConfig: {
            temperature: 0.15,
            responseMimeType:
              "application/json"
          }

        })

      }
    );


    const data =
      await response.json();


    /* =========================
       GEMINI ERROR
    ========================= */

    if (!response.ok) {

      console.error(
        "GEMINI ERROR:",
        data
      );

      return res.status(
        response.status
      ).json({

        error:
          data?.error?.message ||
          "Gemini API request failed."

      });

    }


    /* =========================
       RESPONSE
    ========================= */

    const text =
      data?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;


    if (!text) {

      return res.status(500).json({

        error:
          "Gemini returned an empty response."

      });

    }


    /* =========================
       JSON PARSE
    ========================= */

    try {

      const result =
        JSON.parse(text);


      /* =========================
         SAFETY NORMALIZATION
      ========================= */

      const signal =
        ["CALL", "PUT", "NO TRADE"]
          .includes(result.signal)
          ? result.signal
          : "NO TRADE";


      const confidence =
        Math.max(
          0,
          Math.min(
            100,
            Number(
              result.confidence || 0
            )
          )
        );


      const finalSignal =
        confidence < minConfidence
          ? "NO TRADE"
          : signal;


      return res.status(200).json({

        signal:
          finalSignal,

        confidence,

        trend:
          result.trend ||
          "UNCLEAR",

        expiry:
          result.expiry ||
          timeframe,

        entry_candle:
          finalSignal === "NO TRADE"
            ? "WAIT"
            : (
                result.entry_candle ||
                "WAIT"
              ),

        entry_instruction:
          finalSignal === "NO TRADE"
            ? "Wait for stronger confirmation before entering."
            : (
                result.entry_instruction ||
                "Wait for confirmation before entering."
              ),

        setup:
          result.setup ||
          "No clear setup",

        reasons:
          Array.isArray(
            result.reasons
          )
            ? result.reasons.slice(0, 6)
            : [
                "Visible chart evidence was insufficient."
              ],

        risk:
          result.risk ||
          "HIGH",

        disclaimer:
          "Technical analysis is probabilistic; no signal is guaranteed."

      });


    } catch (parseError) {

      console.error(
        "JSON PARSE ERROR:",
        parseError,
        text
      );


      return res.status(200).json({

        signal:
          "NO TRADE",

        confidence:
          0,

        trend:
          "UNCLEAR",

        expiry:
          timeframe,

        entry_candle:
          "WAIT",

        entry_instruction:
          "AI response could not be safely parsed. Do not enter.",

        setup:
          "Response parsing issue",

        reasons: [
          "The AI response was not valid JSON.",
          "The system blocked the signal for safety."
        ],

        risk:
          "HIGH",

        disclaimer:
          "Technical analysis is probabilistic; no signal is guaranteed."

      });

    }


  } catch (error) {

    console.error(
      "NEXT TRADER ERROR:",
      error
    );


    return res.status(500).json({

      error:
        error?.message ||
        "Gemini API failed."

    });

  }

}
