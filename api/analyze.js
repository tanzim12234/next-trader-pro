import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT = `
You are NEXT TRADER AI, a screenshot-based technical chart analyzer.

Analyze the uploaded trading chart carefully.

Return ONLY valid JSON in exactly this format:

{
  "signal": "CALL",
  "confidence": 0,
  "trend": "BULLISH",
  "expiry": "1 minute",
  "setup": "string",
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "risk": "LOW",
  "disclaimer": "Technical analysis is probabilistic; no signal is guaranteed."
}

Allowed signal values:
CALL, PUT, NO TRADE

Allowed trend values:
BULLISH, BEARISH, SIDEWAYS, UNCLEAR

Allowed risk values:
LOW, MEDIUM, HIGH

Rules:
- Analyze candle structure, trend, support/resistance, momentum and visible indicators.
- Look for confirmation rather than guessing.
- If the chart is unclear, conflicting or low quality, return NO TRADE.
- Never claim certainty or guaranteed profit.
- Confidence must be between 0 and 100.
- Prefer NO TRADE when there is insufficient evidence.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { image } = req.body || {};

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Chart image is required.",
      });
    }

    if (!image.startsWith("data:image/")) {
      return res.status(400).json({
        error: "Invalid image format.",
      });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: PROMPT,
            },
            {
              type: "input_image",
              image_url: image,
              detail: "high",
            },
          ],
        },
      ],
    });

    const text = response.output_text.trim();

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(200).json({
        raw_analysis: text,
      });
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "AI analysis failed.",
    });
  }
}
