import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.5-flash-lite";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  try {

    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Chart image is required."
      });
    }

    const match = image.match(
      /^data:(image\/[^;]+);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid image format."
      });
    }

    const mimeType = match[1];
    const base64Image = match[2];

    const ai = new GoogleGenAI({
      apiKey: apiKey
    });

    const prompt = `
You are NEXT TRADER AI.

Analyze the provided trading chart screenshot.

Return ONLY valid JSON in exactly this format:

{
  "signal": "CALL",
  "confidence": 0,
  "trend": "BULLISH",
  "expiry": "1 minute",
  "setup": "string",
  "reasons": [
    "reason 1",
    "reason 2",
    "reason 3"
  ],
  "risk": "LOW",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

Allowed signal:
CALL, PUT, NO TRADE

Allowed trend:
BULLISH, BEARISH, SIDEWAYS, UNCLEAR

Allowed risk:
LOW, MEDIUM, HIGH

Rules:
1. Analyze candle structure.
2. Analyze market trend.
3. Identify visible support and resistance.
4. Analyze momentum.
5. Look for confirmation.
6. Avoid guessing.
7. If the chart is unclear or signals conflict, return NO TRADE.
8. Never guarantee profit.
9. Never claim certainty.
10. Confidence must be between 0 and 100.
`;

    const interaction = await ai.interactions.create({

      model: MODEL,

      input: [

        {
          type: "text",
          text: prompt
        },

        {
          type: "image",
          data: base64Image,
          mime_type: mimeType
        }

      ]

    });

    const text = interaction.output_text?.trim();

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    try {

      const result = JSON.parse(text);

      return res.status(200).json(result);

    } catch {

      return res.status(200).json({
        raw_analysis: text
      });

    }

  } catch (error) {

    console.error(
      "NEXT_TRADER_AI_ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Gemini AI analysis failed."
    });

  }

}

